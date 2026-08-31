#!/usr/bin/env python3
"""Jalankan klasifikasi Mamdani manual atas reading terbaru tiap device.

Alur: GET /api/v1/readings -> classify_water_quality() -> POST /api/v1/ingest/quality.
Sama seperti yang dilakukan scheduler tiap siklus, tapi dipicu tangan — berguna
untuk debugging tanpa menunggu interval scheduler.

Cuma butuh backend jalan (`docker compose up`), tidak butuh hardware.

    python ml/scripts/run_classification.py
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.mamdani import classify_water_quality
from ml.scripts.api_client import api_get, api_post


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument("--device-code", default=None, help="Batasi ke satu device_code tertentu")
    parser.add_argument(
        "--limit", type=int, default=50, help="Jumlah reading terbaru yang ditarik dari API"
    )
    args = parser.parse_args()

    query = f"limit={args.limit}"
    if args.device_code:
        query += f"&device_code={args.device_code}"

    readings = api_get(f"{args.base_url}/api/v1/readings?{query}", args.api_key)
    if not readings:
        print("Tidak ada sensor_readings ditemukan. Ingest data dulu lewat POST /api/v1/ingest/readings.")
        return

    # API sudah mengurutkan time DESC, jadi yang pertama muncul = paling baru.
    latest_by_device: dict[str, dict] = {}
    for r in readings:
        latest_by_device.setdefault(r["device_code"], r)

    classifications = []
    for code, r in latest_by_device.items():
        # Mamdani butuh ketiga parameter; reading tidak lengkap tidak bisa diklasifikasi.
        if r["ph"] is None or r["temperature_c"] is None or r["salinity_ppt"] is None:
            print(f"[skip] {code}: ada parameter kosong (ph/temperature_c/salinity_ppt)")
            continue

        result = classify_water_quality(
            ph=r["ph"], temperature_c=r["temperature_c"], salinity_ppt=r["salinity_ppt"]
        )
        print(
            f"[{code}] reading@{r['time']} ph={r['ph']} suhu={r['temperature_c']} "
            f"salinitas={r['salinity_ppt']} -> score={result['quality_score']} "
            f"category={result['quality_category']}"
        )

        classifications.append(
            {
                "device_code": code,
                "time": datetime.now(timezone.utc).isoformat(),
                "sensor_reading_time": r["time"],
                "quality_score": result["quality_score"],
                "quality_category": result["quality_category"],
                "membership_degrees": result["membership_degrees"],
                "model_version": "fuzzy-logic",
            }
        )

    if not classifications:
        print("Tidak ada klasifikasi yang bisa dikirim (semua reading punya parameter kosong).")
        return

    response = api_post(
        f"{args.base_url}/api/v1/ingest/quality",
        args.api_key,
        {"classifications": classifications},
    )
    print("\nHasil POST /ingest/quality:")
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()
