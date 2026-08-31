#!/usr/bin/env python3
"""Benchmark akurasi FTS Chen pada dataset riil NERR — bahan Bab 4 skripsi.

Split TEMPORAL, bukan acak: deret waktu yang di-shuffle membocorkan masa depan ke
masa lalu, dan angkanya jadi optimistis palsu.

  - FLRG dibangun dari 2020-2023 (musim hangat)
  - Holdout uji 2024 (musim hangat), FLRG TIDAK dibangun ulang dari data uji

Yang dilaporkan:
  1. RMSE per parameter untuk h=1 (Persamaan 39/43/47).
  2. RMSE per parameter untuk h=1..6 (ML_FORECAST_STEPS) — tabel degradasi akurasi.
  3. Baseline naive Y_hat(t+h) = Y(t) sebagai pembanding. Kalau FTS kalah, itu
     dilaporkan apa adanya — hasil negatif tetap hasil.
  4. Distribusi kategori klasifikasi Mamdani pada data uji (tidak diseimbangkan).

Berdiri sendiri seperti script lain di folder ini — tidak diimpor modul mana pun.
Baca CSV NERR langsung (bukan lewat API) supaya angkanya reproducible tanpa
bergantung isi DB, dan tidak perlu paginasi 67 ribu baris lewat limit=1000.

    python ml/scripts/benchmark_fts_rmse.py
    python ml/scripts/benchmark_fts_rmse.py --max-horizon 12 --bucket-minutes 60
"""

import argparse
import csv
import logging
import re
import sys
from collections import Counter
from datetime import timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.fts import FTS_PARAMS, _build_flrg, _fuzzify_series, forecast_multi_step, rmse
from ml.fuzzy.mamdani import classify_water_quality

# Kolom CSV NERR -> nama parameter di ml/fuzzy/fts.py.
_PARAMETERS = {"Temp": "suhu", "pH": "ph", "Sal": "salinitas"}
_FLAG_COLUMNS = ["F_Temp", "F_pH", "F_Sal"]
_FLAG_CODE_RE = r"^<(-?\d+)>"

_OUTPUT_DIR = Path("data/benchmark")


def _load_clean(input_dir: Path, years: range, months: list[int]) -> pd.DataFrame:
    """Baca CSV NERR, saring QAQC (ketiga flag <0>), potong ke bulan musim hangat.

    Parsing-nya sengaja diulang di sini alih-alih meng-import import_nerr_dataset.py:
    kedua script memang standalone dan tidak boleh saling terkopel.
    """
    files = sorted(f for y in years if (f := input_dir / f"gndblwq{y}.csv").exists())
    if not files:
        raise SystemExit(f"Tidak ada file gndblwq<tahun>.csv di {input_dir}.")

    df = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    df["DateTimeStamp"] = pd.to_datetime(df["DateTimeStamp"], format="%m/%d/%Y %H:%M")

    passed = pd.Series(True, index=df.index)
    for flag_column in _FLAG_COLUMNS:
        passed &= df[flag_column].astype(str).str.extract(_FLAG_CODE_RE, expand=False) == "0"

    df = df[passed & df.DateTimeStamp.dt.month.isin(months)]
    return df.set_index("DateTimeStamp")[list(_PARAMETERS)].astype(float).sort_index()


def _to_buckets(df: pd.DataFrame, bucket_minutes: int) -> pd.DataFrame:
    """Ratakan ke bucket N-menit, buang bucket kosong.

    Setara ml/fuzzy/aggregation.py:aggregate_by_time_bucket untuk bucket kelipatan
    jam, tapi lewat pandas supaya ketiga parameter otomatis sejajar per waktu —
    klasifikasi Mamdani butuh ph/suhu/salinitas dari bucket yang sama.
    """
    return df.resample(f"{bucket_minutes}min").mean().dropna()


def _evaluate(
    parameter: str,
    train: pd.Series,
    test: pd.Series,
    max_horizon: int,
    bucket_minutes: int,
) -> tuple[list[float], list[float], int]:
    """RMSE FTS & baseline naive per horizon di data uji, pakai FLRG dari data latih.

    Origin yang bagian masa depannya berlubang dilewati: kalau bucket ke-(i+h)
    ternyata bukan h*bucket_minutes setelah bucket ke-i, membandingkannya sebagai
    "horizon +h" itu salah — jaraknya bisa berhari-hari.

    Return (rmse_fts per horizon, rmse_naive per horizon, jumlah origin terpakai).
    """
    train_states = _fuzzify_series(parameter, train.tolist())
    flrg = _build_flrg(train_states, list(train.index.to_pydatetime()), bucket_minutes)

    times = list(test.index.to_pydatetime())
    values = test.tolist()
    step = timedelta(minutes=bucket_minutes)

    actual_by_h: list[list[float]] = [[] for _ in range(max_horizon)]
    fts_by_h: list[list[float]] = [[] for _ in range(max_horizon)]
    naive_by_h: list[list[float]] = [[] for _ in range(max_horizon)]

    for i in range(1, len(values) - max_horizon):
        if any(times[i + h] - times[i] != h * step for h in range(1, max_horizon + 1)):
            continue

        # FLRG sudah fix dari data latih, jadi cukup 2 titik terakhir sebagai
        # history — forecast_multi_step cuma butuh state F(n) darinya.
        predicted = forecast_multi_step(
            parameter, values[i - 1 : i + 1], max_horizon, flrg=flrg
        )
        for h in range(max_horizon):
            actual_by_h[h].append(values[i + 1 + h])
            fts_by_h[h].append(predicted[h])
            naive_by_h[h].append(values[i])

    n_origins = len(actual_by_h[0])
    if n_origins == 0:
        return [], [], 0

    return (
        [rmse(actual_by_h[h], fts_by_h[h]) for h in range(max_horizon)],
        [rmse(actual_by_h[h], naive_by_h[h]) for h in range(max_horizon)],
        n_origins,
    )


def _report_out_of_range(label: str, df: pd.DataFrame) -> None:
    """Hitung nilai di luar universe SEKALI di awal — bukan per titik data."""
    for column, parameter in _PARAMETERS.items():
        p = FTS_PARAMS[parameter]
        outside = (~df[column].between(p["d_min"], p["d_max"])).sum()
        if outside:
            print(
                f"  {label} {parameter}: {outside}/{len(df)} bucket di luar "
                f"U=[{p['d_min']}, {p['d_max']}] -> difuzzifikasi ke A1/A_m, tidak dibuang."
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--input-dir", type=Path, default=Path("data/nerr"))
    parser.add_argument("--train-years", default="2020-2023")
    parser.add_argument("--test-years", default="2024")
    parser.add_argument("--months", default="5-10", help="Musim hangat, sama seperti importer")
    parser.add_argument("--bucket-minutes", type=int, default=60, help="ML_BUCKET_MINUTES")
    parser.add_argument("--max-horizon", type=int, default=6, help="ML_FORECAST_STEPS")
    args = parser.parse_args()

    def _years(spec: str) -> range:
        start, _, end = spec.partition("-")
        return range(int(start), int(end or start) + 1)

    month_start, _, month_end = args.months.partition("-")
    months = list(range(int(month_start), int(month_end or month_start) + 1))

    train_raw = _load_clean(args.input_dir, _years(args.train_years), months)
    test_raw = _load_clean(args.input_dir, _years(args.test_years), months)
    train = _to_buckets(train_raw, args.bucket_minutes)
    test = _to_buckets(test_raw, args.bucket_minutes)

    print(f"Latih  {args.train_years} bulan {args.months}: {len(train_raw):,} baris "
          f"-> {len(train):,} bucket {args.bucket_minutes} menit")
    print(f"Uji    {args.test_years} bulan {args.months}: {len(test_raw):,} baris "
          f"-> {len(test):,} bucket {args.bucket_minutes} menit")

    print("\nNilai di luar universe of discourse (dilaporkan sekali, bukan per titik):")
    _report_out_of_range("latih", train)
    _report_out_of_range("uji  ", test)
    # Sudah dihitung & dilaporkan di atas; WARNING per pemanggilan forecast dibungkam
    # supaya tabel di bawah tidak tenggelam oleh ribuan baris log yang sama.
    logging.getLogger("ml.fuzzy.fts").setLevel(logging.ERROR)

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rmse_rows = []

    for column, parameter in _PARAMETERS.items():
        fts_rmse, naive_rmse, n_origins = _evaluate(
            parameter, train[column], test[column], args.max_horizon, args.bucket_minutes
        )
        print(f"\n=== {parameter} ({column}) — {n_origins:,} origin uji ===")
        if n_origins == 0:
            print("Tidak ada origin dengan masa depan kontinu — dilewati.")
            continue

        print(f"{'Horizon':<10}{'RMSE FTS':<14}{'RMSE naive':<14}{'FTS lebih baik?'}")
        for h in range(args.max_horizon):
            better = fts_rmse[h] < naive_rmse[h]
            print(f"+{h + 1:<9}{fts_rmse[h]:<14.4f}{naive_rmse[h]:<14.4f}{'Ya' if better else 'Tidak'}")
            rmse_rows.append(
                {
                    "parameter": parameter,
                    "kolom_sumber": column,
                    "horizon": h + 1,
                    "horizon_menit": (h + 1) * args.bucket_minutes,
                    "rmse_fts": round(fts_rmse[h], 6),
                    "rmse_naive": round(naive_rmse[h], 6),
                    "fts_lebih_baik": better,
                    "n_origin": n_origins,
                }
            )

    # --- Distribusi kategori Mamdani di data uji ---
    categories = Counter(
        classify_water_quality(ph=row.pH, temperature_c=row.Temp, salinity_ppt=row.Sal)[
            "quality_category"
        ]
        for row in test.itertuples()
    )
    total = sum(categories.values())
    print(f"\n=== Distribusi kategori Mamdani pada {total:,} bucket uji ===")
    for category in ("baik", "sedang", "buruk"):
        n = categories.get(category, 0)
        print(f"  {category:<8}{n:>8,}  ({100 * n / total:5.2f}%)")

    rmse_path = _OUTPUT_DIR / "rmse_per_horizon.csv"
    with open(rmse_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rmse_rows[0]))
        writer.writeheader()
        writer.writerows(rmse_rows)

    dist_path = _OUTPUT_DIR / "distribusi_kategori.csv"
    with open(dist_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["kategori", "jumlah", "persen"])
        for category in ("baik", "sedang", "buruk"):
            n = categories.get(category, 0)
            writer.writerow([category, n, round(100 * n / total, 2)])

    print(f"\nCSV: {rmse_path}\n     {dist_path}")


if __name__ == "__main__":
    main()
