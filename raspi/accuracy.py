"""
CARA PAKAI:
    py accuracy.py log.csv
    py test_wlr_accuracy.py data.csv --tz-offset 7 --tolerance-minutes 1 --sample-rows 5
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from ammonia_nh3 import assess_ammonia_risk
from wlr_forecast import PARAMETERS, WLRForecaster

#: Nama kolom virtual untuk hasil turunan (bukan output langsung WLRForecaster),
#: dipakai sebagai key kedua di dict `matched` sama seperti parameter lain.
AMMONIA_KEY = "fraction_nh3_pct"


def _ammonia_pct(ph: float, temperature_c: float, salinity_ppt: float) -> float:
    return assess_ammonia_risk(ph=ph, temperature_c=temperature_c, salinity_ppt=salinity_ppt).fraction_nh3_pct


@dataclass(frozen=True)
class Reading:
    time: datetime
    device_code: str
    kolam: str
    values: dict[str, float | None]


def load_csv(path: str, tz_offset_hours: float) -> dict[tuple[str, str], list[Reading]]:
    """Baca CSV log sensor asli, kelompokkan per (device_code, kolam), urutkan tiap
    grup secara kronologis. 'waktu_lokal' naive diberi offset tz_offset_hours."""
    tz = timezone(timedelta(hours=tz_offset_hours))
    groups: dict[tuple[str, str], list[Reading]] = defaultdict(list)

    # encoding='utf-8-sig' buat buang BOM di awal file (umum dari export Excel/Sheets)
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            t = datetime.fromisoformat(row["waktu_lokal"].strip()).replace(tzinfo=tz)
            key = (row["device_code"], row["kolam"])
            vals = {p: float(row[p]) for p in PARAMETERS}  # dataset ini tidak ada nilai kosong
            groups[key].append(Reading(t, row["device_code"], row["kolam"], vals))

    for key in groups:
        groups[key].sort(key=lambda r: r.time)
    return groups


def nearest_reading(readings: list[Reading], target: datetime, tolerance_minutes: float) -> Reading | None:
    """Cari reading aktual terdekat ke `target` dalam toleransi menit."""
    best, best_diff = None, None
    for r in readings:
        diff = abs((r.time - target).total_seconds())
        if diff <= tolerance_minutes * 60 and (best_diff is None or diff < best_diff):
            best, best_diff = r, diff
    return best


def walk_forward(
    readings: list[Reading], tolerance_minutes: float
) -> dict[tuple[int, str], list[tuple[datetime, float, float]]]:
    """Replay satu grup (device_code, kolam) ke satu WLRForecaster (simulasi produksi),
    cocokkan tiap prediksi ke aktualnya. Return {(horizon, parameter): [(waktu_target, aktual, prediksi), ...]}."""
    forecaster = WLRForecaster()
    # pending: (target_time, horizon, {param: predicted_value}) — disimpan satu baris
    # LENGKAP per horizon (bukan per parameter) supaya ph+suhu+salinitas hasil forecast
    # yang SAMA bisa dipakai bareng buat hitung prediksi amonia.
    pending: list[tuple[datetime, int, dict[str, float]]] = []
    matched: dict[tuple[int, str], list[tuple[datetime, float, float]]] = defaultdict(list)

    for r in readings:
        forecaster.add_reading(r.time, **r.values)
        forecasts = forecaster.forecast(r.time)
        for h, row in forecasts.items():
            pred_row = {p: v for p, v in row.items() if v is not None}
            if pred_row:
                pending.append((r.time + timedelta(minutes=h), h, pred_row))

        still_pending = []
        for target_time, h, pred_row in pending:
            if target_time <= r.time:
                actual_reading = nearest_reading(readings, target_time, tolerance_minutes)
                if actual_reading is not None:
                    for param, pred in pred_row.items():
                        actual = actual_reading.values.get(param)
                        if actual is not None:
                            matched[(h, param)].append((target_time, actual, pred))

                    # Amonia: cuma bisa dihitung kalau ketiga parameter hasil forecast
                    # ADA (rumus speciation butuh ph+suhu+salinitas sekaligus).
                    if all(p in pred_row for p in PARAMETERS):
                        pred_ammonia = _ammonia_pct(
                            pred_row["ph"], pred_row["temperature_c"], pred_row["salinity_ppt"]
                        )
                        actual_ammonia = _ammonia_pct(
                            actual_reading.values["ph"],
                            actual_reading.values["temperature_c"],
                            actual_reading.values["salinity_ppt"],
                        )
                        matched[(h, AMMONIA_KEY)].append((target_time, actual_ammonia, pred_ammonia))
            else:
                still_pending.append((target_time, h, pred_row))
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
    ap.add_argument("csv_path", help="CSV log sensor (waktu_lokal,device_code,kolam,ph,temperature_c,salinity_ppt,fraction_nh3_pct)")
    ap.add_argument("--tz-offset", type=float, default=7.0, help="offset jam dari UTC untuk 'waktu_lokal' (default 7 = WIB)")
    ap.add_argument("--tolerance-minutes", type=float, default=1.0, help="toleransi pencocokan waktu aktual (default 1 menit)")
    ap.add_argument("--sample-rows", type=int, default=5, help="jumlah baris sampel per (horizon, parameter) untuk tabel berita acara (default 5)")
    ap.add_argument("--seed", type=int, default=42, help="seed random untuk pengambilan sampel baris (biar hasil sample bisa direproduksi)")
    args = ap.parse_args()

    groups = load_csv(args.csv_path, args.tz_offset)
    print(f"Ditemukan {len(groups)} kombinasi device_code/kolam di file\n")

    for (device_code, kolam), readings in groups.items():
        print(f"=== device_code={device_code}  kolam={kolam}  ({len(readings)} baris, {readings[0].time} s/d {readings[-1].time}) ===\n")

        matched = walk_forward(readings, args.tolerance_minutes)

        print(f"{'Horizon':>8} {'Parameter':>15} {'n':>6} {'MAPE(%)':>9} {'Akurasi(%)':>11} {'MSE':>10} {'RMSE':>10}")
        for (h, param), pairs in sorted(matched.items()):
            m = compute_metrics(pairs)
            print(f"{h:>6}m {param:>15} {m['n']:>6} {m['mape']:>9.3f} {m['akurasi']:>11.3f} {m['mse']:>10.4f} {m['rmse']:>10.4f}")

        rng = random.Random(args.seed)
        print("\n-- Sampel baris untuk tabel berita acara --")
        for (h, param), pairs in sorted(matched.items()):
            if not pairs:
                continue
            sample = rng.sample(pairs, min(args.sample_rows, len(pairs)))
            sample.sort(key=lambda x: x[0])
            print(f"\nHorizon {h} menit, parameter: {param}")
            print(f"{'No':>3} {'Waktu Uji':>25} {'Aktual':>10} {'Prediksi':>10} {'Error(%)':>9}")
            for i, (t, actual, pred) in enumerate(sample, start=1):
                err = abs(actual - pred) / abs(actual) * 100 if actual != 0 else float("nan")
                print(f"{i:>3} {t.isoformat():>25} {actual:>10.3f} {pred:>10.3f} {err:>9.3f}")
        print()


if __name__ == "__main__":
    main()