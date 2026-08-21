#!/usr/bin/env python3
"""Script uji end-to-end pipeline fuzzy logic (bisa dipanggil manual, belum jadi scheduler):

1. Tarik reading terbaru per device dari GET /api/v1/readings
2. Jalankan inferensi fuzzy Mamdani (ml/fuzzy/mamdani.py)
3. Push hasil klasifikasi via POST /api/v1/ingest/quality

Standalone — hanya butuh backend sismon_kepiting yang jalan (mis. `docker compose up`),
tidak bergantung pada hardware ESP32/Raspberry Pi. Tanpa dependency eksternal,
pakai urllib bawaan Python.

Jalankan dari root project:
    python ml/scripts/test_e2e_classification.py
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml.fuzzy.mamdani import classify_water_quality


def _http_get(url: str, api_key: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def _http_post(url: str, api_key: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": api_key},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"POST {url} -> {exc.code}: {detail}") from exc


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

    readings = _http_get(f"{args.base_url}/api/v1/readings?{query}", args.api_key)
    if not readings:
        print("Tidak ada sensor_readings ditemukan. Ingest data dulu lewat POST /api/v1/ingest/readings.")
        return

    # Ambil reading paling baru per device (readings sudah terurut time DESC dari API).
    latest_by_device: dict[str, dict] = {}
    for r in readings:
        latest_by_device.setdefault(r["device_code"], r)

    classifications = []
    for code, r in latest_by_device.items():
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
                "time": _now_iso(),
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

    response = _http_post(
        f"{args.base_url}/api/v1/ingest/quality",
        args.api_key,
        {"classifications": classifications},
    )
    print("\nHasil POST /ingest/quality:")
    print(json.dumps(response, indent=2))


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    main()
