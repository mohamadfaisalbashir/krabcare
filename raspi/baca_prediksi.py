import serial
import json
import csv
import os
import pickle
from datetime import datetime
from zoneinfo import ZoneInfo

from edge_pipeline import EdgePipeline

# ---------- Konfigurasi ----------
PORT = '/dev/ttyAMA0'
BAUDRATE = 115200
TIMEZONE = ZoneInfo("Asia/Jakarta")  # WIB (UTC+7)

# ---------- Konfigurasi Penyimpanan Dataset (per jam) ----------
OUTPUT_DIR = "/home/pi/TA_Kepiting/data_kualitas_air"   # sesuaikan path sesuai kebutuhan
CSV_FIELDNAMES = ["device_code", "time", "ph", "temperature_c", "salinity_ppt"]

# ---------- Konfigurasi Persistensi Buffer Forecast ----------
# Kalau proses ini mati/restart (listrik/LTE putus), buffer histori di
# WLRForecaster (isinya di RAM) hilang -> forecast 15/30/60 menit jadi
# None lagi sampai buffer terisi ulang. Untuk menghindari itu, state
# forecaster di-pickle ke disk secara berkala dan dipulihkan saat start.
STATE_DIR = "/home/pi/TA_Kepiting/state"
# Simpan tiap N reading, bukan tiap 1, supaya tidak terlalu sering nulis
# ke SD card (SD card kalau kebanyakan write cycle bisa cepat aus).
SAVE_STATE_EVERY_N_READINGS = 5
_reading_counter: dict[str, int] = {}

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

# ---------- State EdgePipeline per device ----------
# WAJIB satu instance per device_code, karena WLRForecaster di dalam
# EdgePipeline menyimpan histori reading (buffer) untuk forecast 15/30/60
# menit. Kalau semua ESP32 berbagi satu instance, histori antar kolam
# akan tercampur dan forecast jadi salah.
_pipelines: dict[str, EdgePipeline] = {}


def path_state_forecaster(device_code: str) -> str:
    return os.path.join(STATE_DIR, f"forecaster_{device_code}.pkl")


def muat_state_forecaster(pipeline: EdgePipeline, device_code: str):
    """Coba pulihkan buffer WLRForecaster dari disk. Kalau tidak ada file
    atau file korup/tidak kompatibel, diamkan saja -> pipeline tetap jalan
    dengan buffer kosong (sama seperti sebelum ada persistensi ini)."""
    path = path_state_forecaster(device_code)
    if not os.path.exists(path):
        return
    try:
        with open(path, "rb") as f:
            pipeline._forecaster = pickle.load(f)
        print(f"[INFO] State forecaster dipulihkan untuk {device_code} <- {path}")
    except Exception as e:
        print(f"[WARNING] Gagal load state forecaster ({e}), mulai dari buffer kosong")


def simpan_state_forecaster(pipeline: EdgePipeline, device_code: str):
    """Tulis state WLRForecaster ke disk secara atomic (tulis ke .tmp lalu
    rename). Rename di filesystem POSIX bersifat atomic, jadi kalau proses
    mati persis saat menulis, file lama tetap utuh -> tidak pernah ada
    file state yang setengah-tertulis/korup."""
    os.makedirs(STATE_DIR, exist_ok=True)
    path = path_state_forecaster(device_code)
    path_tmp = path + ".tmp"
    try:
        with open(path_tmp, "wb") as f:
            pickle.dump(pipeline._forecaster, f)
        os.replace(path_tmp, path)
    except Exception as e:
        print(f"[WARNING] Gagal simpan state forecaster untuk {device_code}: {e}")


def dapatkan_pipeline(device_code: str) -> EdgePipeline:
    if device_code not in _pipelines:
        print(f"[INFO] Membuat EdgePipeline baru untuk device {device_code}")
        pipeline = EdgePipeline(device_code=device_code)
        muat_state_forecaster(pipeline, device_code)
        _pipelines[device_code] = pipeline
        _reading_counter[device_code] = 0
    return _pipelines[device_code]


def dapatkan_device_code(chip_id: str) -> str:
    if chip_id not in KNOWN_DEVICE_IDS:
        print(f"[WARNING] Device ID belum terdaftar di KNOWN_DEVICE_IDS: {chip_id}")
    return chip_id


def buat_reading(data: dict) -> tuple[dict, datetime]:
    """Ubah data mentah dari ESP32 menjadi format 'reading' sesuai skema cloud.

    Mengembalikan (reading, waktu) — reading untuk CSV/payload readings,
    waktu (datetime timezone-aware) untuk dilempar ke EdgePipeline.process().
    """
    waktu_sekarang = datetime.now(TIMEZONE)
    reading = {
        "device_code": dapatkan_device_code(data.get("id", "UNKNOWN")),
        "time": waktu_sekarang.isoformat(timespec="seconds"),
        "ph": data["ph"],
        "temperature_c": data["suhu"],
        "salinity_ppt": data["salinitas"],
    }
    return reading, waktu_sekarang


def dapatkan_nama_file_jam(prefix: str, ekstensi: str, waktu: datetime) -> str:
    """Nama file berdasarkan tanggal & jam, mis: readings_2026-09-04_14.csv
    atau quality_2026-09-04_14.jsonl. Satu fungsi untuk kedua jenis file
    supaya pola rotasinya (dan makna 'jam berganti = file baru') tidak bisa
    diam-diam berbeda antara readings dan quality."""
    return f"{prefix}_{waktu.strftime('%Y-%m-%d_%H')}.{ekstensi}"


def simpan_ke_csv(reading: dict):
    """
    Simpan satu reading ke file CSV yang berotasi tiap jam.
    File baru otomatis dibuat setiap kali jam berganti, sehingga data
    dari tiap kolam tersimpan terorganisir per jam untuk keperluan
    dataset training model ML.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    waktu = datetime.now(TIMEZONE)
    nama_file = dapatkan_nama_file_jam("readings", "csv", waktu)
    path_file = os.path.join(OUTPUT_DIR, nama_file)

    file_baru = not os.path.exists(path_file)

    with open(path_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        if file_baru:
            writer.writeheader()
        writer.writerow(reading)

    print(f"[SAVED] {nama_file} <- {reading['device_code']} @ {reading['time']}")


def simpan_payload_quality(payload: dict):
    """Simpan hasil EdgePipeline (classifications/predictions/ammonia_risks)
    sebagai SATU BARIS JSON ke file yang berotasi tiap jam, format sama
    dengan CSV reading (quality_2026-09-04_14.jsonl).

    SENGAJA JSON Lines, bukan CSV: isinya nested (membership_degrees per
    parameter, tiga list berbeda panjang) yang tidak alami dipetakan ke
    baris/kolom rata seperti reading mentah.

    Proses ini TIDAK PERNAH menyentuh jaringan (lihat catatan di kepala
    berkas) — file inilah titik serah-terima ke cloud_forwarder_watch.py,
    yang membaca file ini (read-only, event-driven lewat inotify) dan
    mengirimkannya ke backend dengan retry/buffer sendiri. Kalau baca
    sensor di sini ikut menunggu HTTP request, satu kali LTE lemot bisa
    bikin pembacaan serial berikutnya telat/ke-skip.
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    waktu = datetime.now(TIMEZONE)
    nama_file = dapatkan_nama_file_jam("quality", "jsonl", waktu)
    path_file = os.path.join(OUTPUT_DIR, nama_file)

    # Cuma tiga field yang dikirim ke backend (kontrak QualityIngestIn).
    # Field "_anomaly_now"/"_anomaly_forecast" punya awalan garis bawah
    # justru sebagai penanda "lokal saja, jangan dikirim" — dibuang di sini.
    payload_kirim = {
        "classifications": payload["classifications"],
        "predictions": payload["predictions"],
        "ammonia_risks": payload["ammonia_risks"],
    }

    # Baris kosong (ketiga list kosong) tidak berguna dikirim dan bakal
    # ditolak backend (QualityIngestIn menolak payload kosong semua) —
    # jangan tulis baris yang pasti gagal.
    if not (payload_kirim["classifications"] or payload_kirim["predictions"] or payload_kirim["ammonia_risks"]):
        return

    with open(path_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(payload_kirim, default=str))
        f.write("\n")

    print(f"[SAVED] {nama_file} <- quality payload")


def simpan_semua_state():
    """Flush state semua pipeline yang aktif. Dipanggil saat shutdown normal
    (Ctrl+C / systemd stop) supaya reading yang belum sempat kena giliran
    simpan berkala tidak hilang percuma."""
    for device_code, pipeline in _pipelines.items():
        simpan_state_forecaster(pipeline, device_code)
    if _pipelines:
        print("[INFO] State forecaster semua device disimpan sebelum keluar.")


def main():
    ser = serial.Serial(PORT, BAUDRATE, timeout=2)
    print(f"[OK] Membaca data dari {PORT} @ {BAUDRATE} baud...")
    print(f"[OK] Reading -> {OUTPUT_DIR}/readings_*.csv, quality -> {OUTPUT_DIR}/quality_*.jsonl")
    print("[OK] Pengiriman ke cloud DITANGANI PROSES LAIN (cloud_forwarder_watch.py).")

    while True:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            print(f"[WARNING] Data tidak valid, dilewati: {line}")
            continue

        try:
            reading, waktu = buat_reading(data)
        except KeyError as e:
            print(f"[WARNING] Field yang dibutuhkan tidak lengkap ({e}), data dilewati: {data}")
            continue

        # Simpan ke CSV untuk keperluan dataset ML (rotasi per jam), SEKALIGUS
        # inilah file yang dipantau cloud_forwarder_watch.py untuk reading mentah.
        simpan_ke_csv(reading)

        # ---- Titik integrasi utama: panggil EdgePipeline setiap reading baru ----
        pipeline = dapatkan_pipeline(reading["device_code"])
        try:
            hasil_pipeline = pipeline.process(
                waktu,
                ph=reading["ph"],
                temperature_c=reading["temperature_c"],
                salinity_ppt=reading["salinity_ppt"],
            )
        except Exception as e:
            # Kalau pipeline error (mis. tipe data aneh dari ESP32), reading
            # tetap sudah aman di CSV, tapi jangan sampai loop utama mati.
            print(f"[ERROR] EdgePipeline gagal memproses reading: {e}")
            continue

        # Info anomali kondisi SEKARANG (bukan forecast) — dipakai untuk
        # keputusan lokal di Pi, mis. nyalain buzzer/LED, tanpa perlu
        # menunggu balasan dari backend.
        if hasil_pipeline["_anomaly_now"]:
            print(f"[ALERT] {reading['device_code']}: kondisi sekarang -> {hasil_pipeline['_anomaly_now']}")
            # TODO: trigger notifikasi lokal (buzzer/LED) di sini kalau perlu

        if hasil_pipeline["_anomaly_forecast"]:
            for f in hasil_pipeline["_anomaly_forecast"]:
                print(
                    f"[FORECAST-ALERT] {reading['device_code']}: prediksi {f['category']} "
                    f"pada +{f['horizon_minutes']} menit ({f['target_time']})"
                )

        # Simpan hasil klasifikasi/prediksi/amonia ke file quality_*.jsonl —
        # INI PENGGANTI kirim langsung ke backend. cloud_forwarder_watch.py
        # yang mengirimkannya, dengan retry kalau jaringan sedang mati.
        simpan_payload_quality(hasil_pipeline)

        # Simpan state buffer forecaster secara berkala (bukan tiap reading)
        # supaya kalau proses restart, forecast tidak perlu menunggu buffer
        # terisi ulang dari nol.
        _reading_counter[reading["device_code"]] += 1
        if _reading_counter[reading["device_code"]] >= SAVE_STATE_EVERY_N_READINGS:
            simpan_state_forecaster(pipeline, reading["device_code"])
            _reading_counter[reading["device_code"]] = 0


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INFO] Dihentikan manual (Ctrl+C).")
    finally:
        simpan_semua_state()
