#!/usr/bin/env python3
"""Backtest RMSE per-horizon FTS dengan walk-forward validation.

Menjawab: sampai jam ke berapa forecast masih lebih akurat daripada baseline naif
(persistence — prediksi = nilai terakhir yang diketahui, diulang tiap horizon)?

Untuk tiap parameter: agregasi histori per jam, geser window satu per satu,
forecast dari tiap window, bandingkan ke nilai aktual & ke baseline, lalu hitung
RMSE per horizon dan simpan ke CSV.

    python ml/scripts/backtest_fts.py --device-code SLV1
"""

import argparse
import csv
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.aggregation import aggregate_by_time_bucket
from ml.fuzzy.fts import forecast_multi_step, rmse
from ml.scripts.api_client import api_get

# Ambang kasar jumlah titik teragregasi supaya hasil backtest layak dipercaya.
_MIN_POINTS = 20
_IDEAL_POINTS = 30


def _fetch_history(
    base_url: str, api_key: str, device_code: str, history_hours: int, bucket_minutes: int
) -> dict[str, list[tuple[datetime, float]]]:
    """Tarik reading device lalu agregasi jadi tiga deret (waktu_bucket, nilai) per parameter."""
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=history_hours)
    query = urllib.parse.urlencode(
        {"device_code": device_code, "start_time": start_time.isoformat(), "limit": 1000}
    )
    readings = api_get(f"{base_url}/api/v1/readings?{query}", api_key)

    return {
        "ph": aggregate_by_time_bucket(readings, "ph", bucket_minutes),
        "suhu": aggregate_by_time_bucket(readings, "temperature_c", bucket_minutes),
        "salinitas": aggregate_by_time_bucket(readings, "salinity_ppt", bucket_minutes),
    }


def _walk_forward_predictions(
    parameter: str,
    series: list[tuple[datetime, float]],
    max_horizon: int,
    bucket_minutes: int,
) -> tuple[list[list[float]], list[list[float]], list[list[float]], int]:
    """Kumpulkan nilai aktual, prediksi FTS, & baseline per horizon dari semua window.

    Window dengan celah temporal di bagian "masa depan"-nya dilewati: kalau bucket
    ke-(i+h) ternyata bukan h*bucket_minutes setelah bucket ke-i, membandingkannya
    sebagai "horizon +h" itu salah — jaraknya bisa berhari-hari. FLR di dalam
    forecast juga sudah gap-aware lewat argumen times/bucket_minutes.

    Return (actual, fts, baseline, jumlah_window); tiga yang pertama masing-masing
    berisi max_horizon list — satu list per horizon.
    """
    actuals_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]
    fts_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]
    baseline_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]

    times = [t for t, _ in series]
    values = [v for _, v in series]
    step = timedelta(minutes=bucket_minutes)

    n = len(series)
    n_windows = 0
    for i in range(1, n):  # window = series[0..i]; FTS butuh minimal 2 titik (i>=1)
        if i + max_horizon >= n:
            break  # sisa data tidak cukup untuk mengecek semua horizon
        if any(times[i + h] - times[i] != h * step for h in range(1, max_horizon + 1)):
            continue  # ada celah di masa depan window ini — bukan horizon yang sebenarnya

        predicted_future = forecast_multi_step(
            parameter, values[: i + 1], max_horizon, times[: i + 1], bucket_minutes
        )
        n_windows += 1

        for h in range(max_horizon):
            actuals_by_horizon[h].append(values[i + 1 + h])
            fts_by_horizon[h].append(predicted_future[h])
            baseline_by_horizon[h].append(values[i])

    return actuals_by_horizon, fts_by_horizon, baseline_by_horizon, n_windows


def _write_csv(
    device_code: str,
    parameter: str,
    rmse_fts_list: list[float],
    rmse_baseline_list: list[float],
) -> Path:
    """Tulis tabel RMSE per horizon ke CSV di direktori kerja (untuk lampiran laporan)."""
    path = Path.cwd() / f"backtest_result_{device_code}_{parameter}.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["horizon_jam", "rmse_fts", "rmse_baseline", "fts_lebih_baik"])
        for idx, (fts_val, baseline_val) in enumerate(zip(rmse_fts_list, rmse_baseline_list), start=1):
            writer.writerow([idx, fts_val, baseline_val, fts_val < baseline_val])
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-code", required=True, help="Device yang di-backtest")
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument("--history-hours", type=int, default=24)
    parser.add_argument("--bucket-minutes", type=int, default=60)
    parser.add_argument(
        "--max-horizon", type=int, default=6, help="Horizon maksimum (jam ke depan) yang diuji"
    )
    args = parser.parse_args()

    history = _fetch_history(
        args.base_url, args.api_key, args.device_code, args.history_hours, args.bucket_minutes
    )

    for parameter, series in history.items():
        print(f"\n=== Backtest FTS — parameter: {parameter} ===")

        if len(series) < _MIN_POINTS:
            print(
                f"PERINGATAN: cuma {len(series)} titik data teragregasi untuk '{parameter}' — "
                f"idealnya minimal ~{_MIN_POINTS}-{_IDEAL_POINTS} titik supaya hasilnya bisa "
                "dipercaya. Angka di bawah tetap dihitung, tapi JANGAN dijadikan kesimpulan "
                "final — perpanjang --history-hours atau kumpulkan data lebih lama dulu."
            )

        actuals_by_h, fts_by_h, baseline_by_h, n_windows = _walk_forward_predictions(
            parameter, series, args.max_horizon, args.bucket_minutes
        )

        if n_windows == 0:
            print(
                f"Tidak cukup data untuk walk-forward validation parameter '{parameter}' "
                f"(butuh minimal {args.max_horizon + 2} titik teragregasi, sekarang {len(series)}). "
                "Dilewati."
            )
            continue

        print(f"Jumlah window walk-forward: {n_windows}\n")

        rmse_fts_list = [rmse(actuals_by_h[h], fts_by_h[h]) for h in range(args.max_horizon)]
        rmse_baseline_list = [
            rmse(actuals_by_h[h], baseline_by_h[h]) for h in range(args.max_horizon)
        ]

        print(f"{'Horizon (jam)':<16}{'RMSE FTS':<14}{'RMSE Baseline':<16}FTS lebih baik?")
        for h in range(args.max_horizon):
            better = rmse_fts_list[h] < rmse_baseline_list[h]
            print(
                f"+{h + 1:<15}{rmse_fts_list[h]:<14.4f}{rmse_baseline_list[h]:<16.4f}"
                f"{'Ya' if better else 'Tidak'}"
            )

        csv_path = _write_csv(args.device_code, parameter, rmse_fts_list, rmse_baseline_list)
        print(f"Hasil disimpan ke: {csv_path}")

        # Horizon reliable = horizon terakhir sebelum RMSE FTS menyamai/melewati baseline.
        reliable_horizon = None
        for h in range(args.max_horizon):
            if rmse_fts_list[h] >= rmse_baseline_list[h]:
                reliable_horizon = h
                break

        if reliable_horizon is None:
            print(
                f"FTS lebih akurat dari baseline persistence di SEMUA horizon 1-{args.max_horizon} "
                "yang diuji — belum ditemukan batas 'reliable maksimum' dalam rentang ini."
            )
        elif reliable_horizon == 0:
            print(
                f"FTS TIDAK lebih akurat dari baseline bahkan di horizon +1 jam — untuk parameter "
                f"'{parameter}', FTS belum reliable sama sekali pada rentang yang diuji."
            )
        else:
            print(
                f"Horizon reliable maksimum untuk '{parameter}': +{reliable_horizon} jam ke depan "
                f"(RMSE FTS mulai >= baseline di horizon +{reliable_horizon + 1})."
            )


if __name__ == "__main__":
    main()
