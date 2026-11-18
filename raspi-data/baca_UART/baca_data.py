import serial
import json
import csv
import os
import requests
from datetime import datetime
from zoneinfo import ZoneInfo

# ---------- Konfigurasi ----------
PORT = '/dev/ttyAMA0'
BAUDRATE = 115200
TIMEZONE = ZoneInfo("Asia/Jakarta")  # WIB (UTC+7)

# ---------- Laporan restart ESP ke cloud ----------
CLOUD_URL_RESTART = os.environ.get("CLOUD_URL_RESTART", "https://api.krabcare.com/api/v1/ingest/restart")
GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY", "")

# ---------- Konfigurasi Penyimpanan Dataset (per jam) ----------
OUTPUT_DIR = "/home/pi/TA_Kepiting/data_kualitas_air"   # sesuaikan path sesuai kebutuhan
CSV_FIELDNAMES = ["device_code", "time", "ph", "temperature_c", "salinity_ppt"]

# ---------- Daftar Chip ID (hex) yang dikenal ----------
# Isi dengan Chip ID asli tiap unit ESP32 (bisa dilihat di Serial Monitor
# ESP32 saat baris "[INFO] Device ID: ..."). List ini opsional, hanya
# dipakai untuk validasi / logging peringatan kalau ada ID yang belum
# terdaftar — device_code yang dikirim tetap memakai ID hex aslinya.
KNOWN_DEVICE_IDS = {
    "54D660E9BFB4",
    # "XXXXXXXXXXXX",
    # "XXXXXXXXXXXX",
}


def dapatkan_device_code(chip_id: str) -> str:
    if chip_id not in KNOWN_DEVICE_IDS:
        print(f"[WARNING] Device ID belum terdaftar di KNOWN_DEVICE_IDS: {chip_id}")
    return chip_id


def buat_reading(data: dict) -> dict:
    """Ubah data mentah dari ESP32 menjadi format 'reading' sesuai skema cloud."""
    waktu_sekarang = datetime.now(TIMEZONE).isoformat(timespec="seconds")
    return {
        "device_code": dapatkan_device_code(data.get("id", "UNKNOWN")),
        "time": waktu_sekarang,
        # Sensor yang gagal membaca tidak mengirim key-nya, mis.
        # {"id": ..., "suhu": 28.4, "salinitas": 19.2} saat probe pH error.
        "ph": data.get("ph"),
        "temperature_c": data.get("suhu"),
        "salinity_ppt": data.get("salinitas"),
    }


def kirim_restart(data: dict):
    """ESP mengirim {"id": ..., "event": "boot", "reset_reason": "WDT"} sekali saat boot.

    ponytail: langsung POST tanpa buffer. Laporan restart yang baru terkirim
    belasan menit kemudian sudah tidak berguna untuk status dashboard.
    """
    payload = {
        "device_code": dapatkan_device_code(data.get("id", "UNKNOWN")),
        "time": datetime.now(TIMEZONE).isoformat(timespec="seconds"),
        "reset_reason": data.get("reset_reason"),
    }
    try:
        resp = requests.post(
            CLOUD_URL_RESTART, json=payload, headers={"X-API-Key": GATEWAY_API_KEY}, timeout=5
        )
        print(f"[RESTART] {payload['device_code']} -> HTTP {resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[WARNING] Gagal kirim laporan restart {payload['device_code']}: {e}")


def dapatkan_nama_file_jam(waktu: datetime) -> str:
    """Nama file berdasarkan tanggal & jam, misal: readings_2026-09-04_14.csv"""
    return f"readings_{waktu.strftime('%Y-%m-%d_%H')}.csv"


def simpan_ke_csv(reading: dict):
    """
    Simpan satu reading ke file CSV yang berotasi tiap jam.
    File baru otomatis dibuat setiap kali jam berganti, sehingga data
    dari tiap kolam tersimpan terorganisir per jam untuk keperluan
    dataset training model ML.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    waktu = datetime.now(TIMEZONE)
    nama_file = dapatkan_nama_file_jam(waktu)
    path_file = os.path.join(OUTPUT_DIR, nama_file)

    file_baru = not os.path.exists(path_file)

    with open(path_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if file_baru:
            writer.writeheader()
        writer.writerow(reading)

    print(f"[SAVED] {nama_file} <- {reading['device_code']} @ {reading['time']}")


def main():
    ser = serial.Serial(PORT, BAUDRATE, timeout=2)
    print(f"[OK] Membaca data dari {PORT} @ {BAUDRATE} baud...")

    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            print(f"[WARNING] Data tidak valid, dilewati: {line}")
            continue

        if data.get("event") in ("boot", "restart"):
            kirim_restart(data)
            continue

        try:
            reading = buat_reading(data)
        except KeyError as e:
            print(f"[WARNING] Field yang dibutuhkan tidak lengkap ({e}), data dilewati: {data}")
            continue

        # Simpan ke CSV untuk keperluan dataset ML (rotasi per jam)
        simpan_ke_csv(reading)

        # Bungkus jadi payload siap kirim ke cloud (format "readings": [...])
        payload = {"readings": [reading]}
        print(json.dumps(payload, indent=2))

        # TODO: kirim payload ke endpoint cloud, contoh:
        # import requests
        # requests.post("https://<endpoint-cloud-kamu>/api/readings", json=payload, timeout=5)


if __name__ == "__main__":
    main()
