#!/usr/bin/env python3
"""Prediksi satu langkah ke depan (FTS Chen) untuk satu device, lalu kirim hasilnya.

Alur: GET /api/v1/readings -> forecast_next() per parameter -> nilai ramalan
diklasifikasi ulang lewat Mamdani -> POST /api/v1/ingest/quality (field
`predictions`, endpoint yang sama dengan klasifikasi).

Versi multi-langkah + deteksi anomali ada di scan_anomaly.py.

    python ml/scripts/run_forecast.py --device-code SLV1
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.fts import forecast_next
from ml.fuzzy.mamdani import classify_water_quality
from ml.scripts.api_client import api_get, api_post


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument("--device-code", required=True, help="Device yang diprediksi historinya")
    parser.add_argument(
        "--limit", type=int, default=50, help="Jumlah reading historis terbaru yang ditarik"
    )
    parser.add_argument(
        "--horizon-minutes", type=int, default=60, help="Horizon prediksi jangka pendek (menit)"
    )
    args = parser.parse_args()

    readings = api_get(
        f"{args.base_url}/api/v1/readings?device_code={args.device_code}&limit={args.limit}",
        args.api_key,
    )
    if len(readings) < 2:
        print(
            f"Histori '{args.device_code}' cuma {len(readings)} baris — FTS butuh minimal 2. "
            "Ingest lebih banyak data dulu lewat POST /api/v1/ingest/readings."
        )
        return

    # API balas time DESC; FTS butuh kronologis (lama -> baru).
    readings.sort(key=lambda r: r["time"])

    ph_history = [r["ph"] for r in readings if r["ph"] is not None]
    temp_history = [r["temperature_c"] for r in readings if r["temperature_c"] is not None]
    salinity_history = [r["salinity_ppt"] for r in readings if r["salinity_ppt"] is not None]

    predicted_ph = forecast_next("ph", ph_history)
    predicted_temp = forecast_next("suhu", temp_history)
    predicted_salinity = forecast_next("salinitas", salinity_history)

    print(
        f"Histori {len(readings)} reading -> prediksi 1 langkah ke depan:\n"
        f"  ph: {ph_history[-1]} -> {predicted_ph:.2f}\n"
        f"  suhu: {temp_history[-1]} -> {predicted_temp:.2f}\n"
        f"  salinitas: {salinity_history[-1]} -> {predicted_salinity:.2f}"
    )

    classification = classify_water_quality(
        ph=predicted_ph, temperature_c=predicted_temp, salinity_ppt=predicted_salinity
    )
    print(
        f"Klasifikasi atas nilai prediksi -> score={classification['quality_score']} "
        f"category={classification['quality_category']}"
    )

    now = datetime.now(timezone.utc)
    target_time = now + timedelta(minutes=args.horizon_minutes)

    payload = {
        "predictions": [
            {
                "device_code": args.device_code,
                "time": now.isoformat(),
                "target_time": target_time.isoformat(),
                "horizon_minutes": args.horizon_minutes,
                "predicted_quality_score": classification["quality_score"],
                "predicted_category": classification["quality_category"],
                "model_version": "fuzzy-time-series-chen-v1",
            }
        ]
    }

    response = api_post(f"{args.base_url}/api/v1/ingest/quality", args.api_key, payload)
    print("\nHasil POST /ingest/quality:")
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()
