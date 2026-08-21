#!/usr/bin/env python3
"""Generator data sensor SINTETIS untuk keperluan testing pipeline ML sebelum
data asli dari Raspberry Pi tersedia.

>>> FILE INI SEMENTARA <<<
Begitu data asli sudah mengalir dari hardware, HAPUS file ini. Tidak ada modul
lain (scheduler, backend/, ml/fuzzy/) yang meng-import file ini — penghapusan
tidak memerlukan perubahan apa pun di tempat lain.

POST batch reading sintetis ke POST /api/v1/ingest/readings, format & endpoint
identik dengan yang dipakai gateway Raspberry Pi asli.

Standalone, urllib bawaan Python (konsisten dengan ml/scripts/*.py lain).

Contoh pakai:
    # Isi sekaligus 48 jam histori ke belakang, sampling tiap 15 menit, lalu keluar
    python ml/scripts/synthetic_data_generator.py --backfill-hours 48

    # Kirim satu titik data (timestamp=now) untuk semua device, lalu keluar
    python ml/scripts/synthetic_data_generator.py --once

    # Mode kontinu: kirim data terbaru tiap 5 menit sampai Ctrl+C
    python ml/scripts/synthetic_data_generator.py --interval-seconds 300
"""

import argparse
import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# Rentang toleransi (universe of discourse) — disamakan dengan ml/fuzzy/fts.py
# (FTS_PARAMS) & ml/fuzzy/mamdani.py (PARAMETER_SETS) supaya konsisten dengan
# model, walau file ini sendiri TIDAK meng-import keduanya (berdiri sendiri).
_TOLERANCE_RANGES = {
    "ph": (6.5, 9.0),
    "temperature_c": (20.0, 35.0),
    "salinity_ppt": (5.0, 40.0),
}

# Target rentang optimal — tempat random-walk berosilasi secara wajar sehari-hari.
_OPTIMAL_RANGES = {
    "ph": (7.5, 8.5),
    "temperature_c": (28.0, 30.0),
    "salinity_ppt": (10.0, 30.0),
}

# Skala langkah random-walk per parameter (bukan noise putih murni, supaya pola
# temporalnya masuk akal buat FTS).
_STEP_SIZE = {
    "ph": 0.08,
    "temperature_c": 0.4,
    "salinity_ppt": 0.8,
}


class DeviceState:
    """State random-walk satu device: nilai ph/temperature_c/salinity_ppt saat ini."""

    def __init__(self) -> None:
        self.values = {key: random.uniform(*_OPTIMAL_RANGES[key]) for key in _TOLERANCE_RANGES}

    def step(self, anomaly_probability: float) -> dict[str, float]:
        result = {}
        for key, (lo, hi) in _TOLERANCE_RANGES.items():
            current = self.values[key]
            new_value = current + random.gauss(0, _STEP_SIZE[key])

            if random.random() < anomaly_probability:
                # Sengaja lompat ke luar rentang toleransi (uji jalur deteksi anomali).
                jump = abs(random.gauss(0, _STEP_SIZE[key] * 3)) + 0.5
                new_value = (lo - jump) if random.random() < 0.5 else (hi + jump)
            else:
                new_value = max(lo, min(hi, new_value))

            self.values[key] = new_value
            result[key] = round(new_value, 2)

        return result


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


def _send_batch(
    base_url: str,
    api_key: str,
    device_codes: list[str],
    states: dict[str, DeviceState],
    timestamp: datetime,
    anomaly_probability: float,
) -> dict:
    readings = []
    for code in device_codes:
        values = states[code].step(anomaly_probability)
        readings.append(
            {
                "device_code": code,
                "time": timestamp.isoformat(),
                "ph": values["ph"],
                "temperature_c": values["temperature_c"],
                "salinity_ppt": values["salinity_ppt"],
            }
        )

    response = _http_post(f"{base_url}/api/v1/ingest/readings", api_key, {"readings": readings})
    print(
        f"[{timestamp.isoformat()}] inserted={response.get('inserted')} "
        f"skipped_duplicates={len(response.get('skipped_duplicates', []))} "
        f"unknown_device_codes={response.get('unknown_device_codes')}"
    )
    return response


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--device-codes",
        default="SLV1,SLV2,SLV3",
        help="Daftar device_code dipisah koma",
    )
    parser.add_argument(
        "--base-url", default=os.environ.get("SISMON_KEPITING_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", "ai-dilarangbaca"))
    parser.add_argument(
        "--sampling-minutes", type=int, default=15, help="Jarak antar titik data sintetis"
    )
    parser.add_argument(
        "--backfill-hours",
        type=int,
        default=0,
        help="Kalau > 0: generate & POST satu batch histori sepanjang N jam ke belakang, lalu keluar",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=300,
        help="Mode kontinu: jeda antar pengiriman titik data terbaru (detik)",
    )
    parser.add_argument(
        "--once", action="store_true", help="Kirim satu batch (timestamp=now) lalu keluar"
    )
    parser.add_argument(
        "--anomaly-probability",
        type=float,
        default=0.0,
        help="Peluang (0-1) per titik data satu parameter di-generate di luar rentang toleransi",
    )
    parser.add_argument(
        "--seed", type=int, default=None, help="random.seed() untuk hasil reproducible"
    )
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    device_codes = [c.strip() for c in args.device_codes.split(",") if c.strip()]
    states = {code: DeviceState() for code in device_codes}

    if args.backfill_hours > 0:
        n_points = int(args.backfill_hours * 60 / args.sampling_minutes)
        now = datetime.now(timezone.utc)
        print(
            f"Backfill {args.backfill_hours} jam ({n_points} titik, sampling "
            f"{args.sampling_minutes} menit) untuk device: {device_codes}"
        )
        for i in range(n_points, 0, -1):
            timestamp = now - timedelta(minutes=i * args.sampling_minutes)
            _send_batch(
                args.base_url, args.api_key, device_codes, states, timestamp,
                args.anomaly_probability,
            )
        print("Backfill selesai.")
        return

    if args.once:
        _send_batch(
            args.base_url, args.api_key, device_codes, states,
            datetime.now(timezone.utc), args.anomaly_probability,
        )
        return

    print(
        f"Mode kontinu: kirim data tiap {args.interval_seconds} detik untuk device "
        f"{device_codes}. Ctrl+C untuk berhenti."
    )
    try:
        while True:
            _send_batch(
                args.base_url, args.api_key, device_codes, states,
                datetime.now(timezone.utc), args.anomaly_probability,
            )
            time.sleep(args.interval_seconds)
    except KeyboardInterrupt:
        print("\nDihentikan.")


if __name__ == "__main__":
    main()
