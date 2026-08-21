#!/usr/bin/env python3
"""Backtesting RMSE per-horizon fuzzy time series (metode Chen) — walk-forward validation.

Menjawab pertanyaan: sampai jam ke berapa ke depan forecast_multi_step() masih
lebih akurat dibanding baseline naif (persistence: prediksi = nilai terakhir yang
diketahui, diulang untuk tiap horizon)?

Metodologi walk-forward validation, untuk tiap parameter (ph, suhu, salinitas):
1. Tarik & agregasi histori per-jam device (sama seperti forecast_anomaly_scan.py)
2. Untuk tiap indeks i pada deret hasil agregasi yang masih menyisakan minimal
   max_horizon titik data setelahnya: forecast dari window [0..i], bandingkan ke
   actual [i+1..i+max_horizon] dan ke baseline persistence (nilai di titik i).
3. Hitung RMSE per horizon (pakai rmse() dari ml/fuzzy/fts.py) untuk FTS & baseline.
4. Cetak tabel hasil + simpan ke CSV backtest_result_<device_code>_<parameter>.csv.
5. Tentukan horizon reliable maksimum = horizon terakhir sebelum RMSE FTS >= RMSE
   baseline.

Standalone, tanpa dependency eksternal (urllib & csv bawaan Python).

Jalankan dari root project:
    python ml/scripts/backtest_fts_horizon.py --device-code SLV1
"""

import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.aggregation import aggregate_by_time_bucket
from ml.fuzzy.fts import forecast_multi_step, rmse

# Batas kasar jumlah titik data teragregasi supaya hasil backtest cukup bisa dipercaya.
_MIN_POINTS_FOR_RELIABLE_BACKTEST = 20
_RECOMMENDED_POINTS = 30


def _http_get(url: str, api_key: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def _fetch_history(
    base_url: str, api_key: str, device_code: str, history_hours: int, bucket_minutes: int
) -> dict[str, list[float]]:
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=history_hours)
    query = urllib.parse.urlencode(
        {"device_code": device_code, "start_time": start_time.isoformat(), "limit": 1000}
    )
    readings = _http_get(f"{base_url}/api/v1/readings?{query}", api_key)

    return {
        "ph": [v for _, v in aggregate_by_time_bucket(readings, "ph", bucket_minutes)],
        "suhu": [v for _, v in aggregate_by_time_bucket(readings, "temperature_c", bucket_minutes)],
        "salinitas": [
            v for _, v in aggregate_by_time_bucket(readings, "salinity_ppt", bucket_minutes)
        ],
    }


def _walk_forward_predictions(
    parameter: str, series: list[float], max_horizon: int
) -> tuple[list[list[float]], list[list[float]], list[list[float]], int]:
    """Kumpulkan actual & prediksi (FTS + baseline persistence) per horizon dari
    seluruh window walk-forward.

    Return (actuals_by_horizon, fts_predicted_by_horizon, baseline_predicted_by_horizon,
    jumlah_window), tiap `_by_horizon` adalah list sepanjang max_horizon berisi list
    nilai dari semua window.
    """
    actuals_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]
    fts_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]
    baseline_by_horizon: list[list[float]] = [[] for _ in range(max_horizon)]

    n = len(series)
    n_windows = 0
    for i in range(1, n):  # history_window = series[0..i], minimal 2 titik (i>=1)
        actual_future = series[i + 1 : i + 1 + max_horizon]
        if len(actual_future) < max_horizon:
            break  # tidak cukup titik aktual sesudahnya untuk semua horizon

        history_window = series[: i + 1]
        predicted_future = forecast_multi_step(parameter, history_window, steps=max_horizon)
        baseline_future = [series[i]] * max_horizon
        n_windows += 1

        for h in range(max_horizon):
            actuals_by_horizon[h].append(actual_future[h])
            fts_by_horizon[h].append(predicted_future[h])
            baseline_by_horizon[h].append(baseline_future[h])

    return actuals_by_horizon, fts_by_horizon, baseline_by_horizon, n_windows


def _write_csv(
    device_code: str,
    parameter: str,
    rmse_fts_list: list[float],
    rmse_baseline_list: list[float],
) -> Path:
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

        if len(series) < _MIN_POINTS_FOR_RELIABLE_BACKTEST:
            print(
                f"PERINGATAN: cuma {len(series)} titik data teragregasi untuk '{parameter}' — "
                f"idealnya minimal ~{_MIN_POINTS_FOR_RELIABLE_BACKTEST}-{_RECOMMENDED_POINTS} titik "
                "supaya hasil backtest bisa dipercaya. Hasil di bawah tetap dihitung, tapi JANGAN "
                "dijadikan kesimpulan final — perpanjang --history-hours atau kumpulkan data lebih "
                "lama dulu."
            )

        actuals_by_h, fts_by_h, baseline_by_h, n_windows = _walk_forward_predictions(
            parameter, series, args.max_horizon
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

        reliable_horizon = None
        for h in range(args.max_horizon):
            if rmse_fts_list[h] >= rmse_baseline_list[h]:
                reliable_horizon = h  # horizon+1 (h+1 jam) mulai gagal -> terakhir baik = h jam
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
