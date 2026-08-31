#!/usr/bin/env python3
"""Deteksi dini anomali: forecast beberapa jam ke depan lalu sapu kategorinya.

Alur: tarik reading -> agregasi per jam -> forecast_multi_step() tiap parameter ->
tiap langkah digabung lewat Mamdani jadi satu kategori -> kumpulkan jam yang
sedang/buruk -> POST semua langkah sekaligus ke /api/v1/ingest/quality.

Versi manual dari apa yang dikerjakan scheduler tiap siklus.

    python ml/scripts/scan_anomaly.py --device-code SLV1
"""

import argparse
import json
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.aggregation import aggregate_by_time_bucket
from ml.fuzzy.fts import forecast_multi_step
from ml.fuzzy.mamdani import ANOMALY_CATEGORIES, classify_water_quality
from ml.scripts.api_client import api_get, api_post


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-code", required=True, help="Device yang diperiksa")
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument("--bucket-minutes", type=int, default=60, help="Lebar bucket agregasi (menit)")
    parser.add_argument(
        "--history-hours", type=int, default=24, help="Rentang histori yang ditarik (jam ke belakang)"
    )
    parser.add_argument(
        "--max-steps", type=int, default=6, help="Jumlah langkah/jam ke depan yang diperiksa"
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=args.history_hours)
    query = urllib.parse.urlencode(
        {"device_code": args.device_code, "start_time": start_time.isoformat(), "limit": 1000}
    )
    readings = api_get(f"{args.base_url}/api/v1/readings?{query}", args.api_key)

    if not readings:
        print(
            f"Tidak ada reading untuk '{args.device_code}' dalam {args.history_hours} jam terakhir. "
            "Ingest data dulu lewat POST /api/v1/ingest/readings."
        )
        return

    ph_buckets = aggregate_by_time_bucket(readings, "ph", args.bucket_minutes)
    temp_buckets = aggregate_by_time_bucket(readings, "temperature_c", args.bucket_minutes)
    salinity_buckets = aggregate_by_time_bucket(readings, "salinity_ppt", args.bucket_minutes)

    for label, buckets in (
        ("pH", ph_buckets),
        ("suhu", temp_buckets),
        ("salinitas", salinity_buckets),
    ):
        if len(buckets) < 2:
            print(
                f"Data '{label}' setelah diagregasi per {args.bucket_minutes} menit cuma "
                f"{len(buckets)} bucket valid — FTS butuh minimal 2. Perpanjang --history-hours "
                "atau ingest data lebih sering dulu."
            )
            return

    ph_history = [v for _, v in ph_buckets]
    temp_history = [v for _, v in temp_buckets]
    salinity_history = [v for _, v in salinity_buckets]
    last_bucket_time = max(ph_buckets[-1][0], temp_buckets[-1][0], salinity_buckets[-1][0])

    # Waktu bucket ikut dilewatkan: FLR tidak boleh dibentuk melintasi celah data.
    ph_forecast = forecast_multi_step(
        "ph", ph_history, args.max_steps, [t for t, _ in ph_buckets], args.bucket_minutes
    )
    temp_forecast = forecast_multi_step(
        "suhu", temp_history, args.max_steps, [t for t, _ in temp_buckets], args.bucket_minutes
    )
    salinity_forecast = forecast_multi_step(
        "salinitas", salinity_history, args.max_steps,
        [t for t, _ in salinity_buckets], args.bucket_minutes,
    )

    print(
        f"Histori teragregasi ({args.bucket_minutes} menit/bucket): "
        f"pH={len(ph_buckets)}, suhu={len(temp_buckets)}, salinitas={len(salinity_buckets)} bucket"
    )
    print(f"Bucket terakhir: {last_bucket_time.isoformat()}\n")

    now_run = datetime.now(timezone.utc)
    predictions_payload = []
    anomalies = []

    print(f"{'Jam ke':<8}{'Target waktu':<28}{'pH':<8}{'Suhu':<8}{'Salinitas':<10}{'Skor':<8}Kategori")
    for h in range(1, args.max_steps + 1):
        predicted_ph = ph_forecast[h - 1]
        predicted_temp = temp_forecast[h - 1]
        predicted_salinity = salinity_forecast[h - 1]

        result = classify_water_quality(
            ph=predicted_ph, temperature_c=predicted_temp, salinity_ppt=predicted_salinity
        )
        target_time = last_bucket_time + timedelta(minutes=h * args.bucket_minutes)

        print(
            f"+{h:<7}{target_time.isoformat():<28}{predicted_ph:<8.2f}{predicted_temp:<8.2f}"
            f"{predicted_salinity:<10.2f}{result['quality_score']:<8.2f}{result['quality_category']}"
        )

        if result["quality_category"] in ANOMALY_CATEGORIES:
            anomalies.append((h, target_time, result["quality_category"], result["quality_score"]))

        predictions_payload.append(
            {
                "device_code": args.device_code,
                "time": now_run.isoformat(),
                "target_time": target_time.isoformat(),
                "horizon_minutes": h * args.bucket_minutes,
                "predicted_quality_score": result["quality_score"],
                "predicted_category": result["quality_category"],
                "predicted_ph": predicted_ph,
                "predicted_temperature_c": predicted_temp,
                "predicted_salinity_ppt": predicted_salinity,
                "model_version": "fts",
            }
        )

    print()
    if anomalies:
        print(f"PERINGATAN: terdeteksi {len(anomalies)} jam dengan kategori anomali (sedang/buruk):")
        for h, target_time, category, score in anomalies:
            print(f"  - Jam ke+{h} ({target_time.isoformat()}): {category} (skor {score:.2f})")
    else:
        print(f"Tidak ada anomali terdeteksi dalam {args.max_steps} jam ke depan (semua kategori baik).")

    response = api_post(
        f"{args.base_url}/api/v1/ingest/quality",
        args.api_key,
        {"predictions": predictions_payload},
    )
    print("\nHasil POST /ingest/quality:")
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()
