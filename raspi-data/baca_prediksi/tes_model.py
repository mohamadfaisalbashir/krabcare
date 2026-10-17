from __future__ import annotations
 
import argparse
import csv
import math
import random
import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
 
from wlr_forecast import PARAMETERS, WLRForecaster
 
 
@dataclass(frozen=True)
class Reading:
    time: datetime
    values: dict[str, float | None]
 
 
def load_csv(path: str) -> list[Reading]:
    """Baca CSV: kolom 'time' + kolom tiap parameter di PARAMETERS (ph, temperature_c,
    salinity_ppt). Baris dengan 'time' kosong/tidak valid dilewati."""
    readings: list[Reading] = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            t = datetime.fromisoformat(row["time"])
            if t.tzinfo is None:
                raise ValueError(
                    f"time '{row['time']}' tidak timezone-aware — samakan format dengan "
                    "konvensi ingest API (lihat docstring wlr_forecast.py)."
                )
            vals = {}
            for p in PARAMETERS:
                raw = row.get(p, "")
                vals[p] = float(raw) if raw not in ("", None) else None
            readings.append(Reading(t, vals))
    readings.sort(key=lambda r: r.time)
    return readings
 
 
def nearest_reading(readings: list[Reading], target: datetime, tolerance_minutes: float) -> Reading | None:
    """Cari reading aktual terdekat ke `target` dalam toleransi menit. Dipakai untuk
    mencocokkan prediksi dengan nilai aktual, karena sampling riil jarang persis pas
    detik ke detik."""
    best, best_diff = None, None
    for r in readings:
        diff = abs((r.time - target).total_seconds())
        if diff <= tolerance_minutes * 60 and (best_diff is None or diff < best_diff):
            best, best_diff = r, diff
    return best
 
 
def walk_forward(readings: list[Reading], tolerance_minutes: float) -> dict[tuple[int, str], list[tuple[datetime, float, float]]]:
    """Replay semua reading ke satu WLRForecaster (persis simulasi produksi), lalu
    cocokkan tiap prediksi ke aktualnya. Return {(horizon, parameter): [(waktu_target, aktual, prediksi), ...]}."""
    forecaster = WLRForecaster()
    pending: list[tuple[datetime, int, str, float]] = []  # (target_time, horizon, param, pred)
    matched: dict[tuple[int, str], list[tuple[datetime, float, float]]] = defaultdict(list)
 
    for r in readings:
        forecaster.add_reading(r.time, **r.values)
        forecasts = forecaster.forecast(r.time)
        for h, row in forecasts.items():
            for param, pred in row.items():
                if pred is not None:
                    from datetime import timedelta
 
                    pending.append((r.time + timedelta(minutes=h), h, param, pred))
 
        # cocokkan prediksi lama yang target waktunya sudah lewat 'r.time'
        still_pending = []
        for target_time, h, param, pred in pending:
            if target_time <= r.time:
                actual_reading = nearest_reading(readings, target_time, tolerance_minutes)
                actual = actual_reading.values.get(param) if actual_reading else None
                if actual is not None:
                    matched[(h, param)].append((target_time, actual, pred))
            else:
                still_pending.append((target_time, h, param, pred))
        pending = still_pending
 
    return matched
 
 
def compute_metrics(pairs: list[tuple[datetime, float, float]]) -> dict[str, float]:
    errors_pct = [abs(a - p) / abs(a) * 100 for _, a, p in pairs if a != 0]
    sq_errors = [(a - p) ** 2 for _, a, p in pairs]
    mse = statistics.fmean(sq_errors)
    return {
        "n": len(pairs),
        "mape": statistics.fmean(errors_pct) if errors_pct else float("nan"),
        "akurasi": 100 - statistics.fmean(errors_pct) if errors_pct else float("nan"),
        "mse": mse,
        "rmse": math.sqrt(mse),
    }
 
 
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path", help="CSV data historis (time,ph,temperature_c,salinity_ppt)")
    ap.add_argument("--tolerance-minutes", type=float, default=1.0, help="toleransi pencocokan waktu aktual (default 1 menit)")
    ap.add_argument("--sample-rows", type=int, default=5, help="jumlah baris sampel per (horizon, parameter) untuk tabel berita acara (default 5)")
    ap.add_argument("--seed", type=int, default=42, help="seed random untuk pengambilan sampel baris (biar hasil sample bisa direproduksi)")
    args = ap.parse_args()
 
    readings = load_csv(args.csv_path)
    print(f"Memuat {len(readings)} baris data historis ({readings[0].time} s/d {readings[-1].time})\n")
 
    matched = walk_forward(readings, args.tolerance_minutes)
 
    print(f"{'Horizon':>8} {'Parameter':>15} {'n':>6} {'MAPE(%)':>9} {'Akurasi(%)':>11} {'MSE':>10} {'RMSE':>10}")
    for (h, param), pairs in sorted(matched.items()):
        m = compute_metrics(pairs)
        print(f"{h:>6}m {param:>15} {m['n']:>6} {m['mape']:>9.3f} {m['akurasi']:>11.3f} {m['mse']:>10.4f} {m['rmse']:>10.4f}")
 
    # Sampel baris untuk diisi manual ke tabel "Error (%)" berita acara
    rng = random.Random(args.seed)
    print("\n=== Sampel baris untuk tabel berita acara ===")
    for (h, param), pairs in sorted(matched.items()):
        if not pairs:
            continue
        sample = rng.sample(pairs, min(args.sample_rows, len(pairs)))
        sample.sort(key=lambda x: x[0])
        print(f"\n-- Horizon {h} menit, parameter: {param} --")
        print(f"{'No':>3} {'Waktu Uji':>25} {'Aktual':>10} {'Prediksi':>10} {'Error(%)':>9}")
        for i, (t, actual, pred) in enumerate(sample, start=1):
            err = abs(actual - pred) / abs(actual) * 100 if actual != 0 else float("nan")
            print(f"{i:>3} {t.isoformat():>25} {actual:>10.3f} {pred:>10.3f} {err:>9.3f}")
 
 
if __name__ == "__main__":
    main()
