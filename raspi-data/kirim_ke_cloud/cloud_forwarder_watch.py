"""
cloud_forwarder_watch.py

Versi EVENT-DRIVEN dari forwarder — TIDAK polling.

Menggunakan inotify (lewat library `watchdog`) supaya proses ini "tidur"
total dan hanya dibangunkan oleh kernel Linux saat file benar-benar
ditulis oleh script pembaca UART (baca_prediksi.py). Tidak ada loop
cek-cek berulang yang membebani CPU saat tidak ada data baru.

Tetap TERPISAH dari script pembaca UART — hanya membaca (read-only) file
yang dihasilkannya, tidak pernah menyentuh port serial.

Mengirim DUA JENIS data, dari DUA JENIS file berbeda, ke DUA endpoint
berbeda, tapi lewat mekanisme yang identik (event -> baca baris baru ->
kirim batch -> kalau gagal, simpan ke buffer SQLite -> dicoba ulang berkala):

  - readings_*.csv   -> POST /api/v1/ingest/readings  (reading mentah sensor)
  - quality_*.jsonl  -> POST /api/v1/ingest/quality    (klasifikasi + prediksi
                         WLR 15/30/60 menit + risiko amonia, sudah dihitung
                         EdgePipeline di baca_prediksi.py)

Dua buffer SQLite terpisah (tabel `buffer` untuk readings, `buffer_quality`
untuk quality) — bukan satu tabel campur, karena bentuk payload-nya beda
(readings = list rata, quality = dict berisi tiga list) dan supaya satu
jenis yang gagal terus tidak ikut menahan retry jenis satunya.

Install dulu: pip install watchdog requests --break-system-packages
"""
import os
import csv
import json
import time
import threading
import sqlite3
import requests
from datetime import datetime
from zoneinfo import ZoneInfo
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ---------- Konfigurasi (harus SAMA dengan script pembaca UART) ----------
OUTPUT_DIR = "/home/pi/TA_Kepiting/data_kualitas_air"
TIMEZONE = ZoneInfo("Asia/Jakarta")
CSV_FIELDNAMES = ["device_code", "time", "ph", "temperature_c", "salinity_ppt"]

# ---------- Konfigurasi Cloud ----------
CLOUD_URL_READINGS = os.environ.get("CLOUD_URL_READINGS", "https://api.krabcare.com/api/v1/ingest/readings")
CLOUD_URL_QUALITY = os.environ.get("CLOUD_URL_QUALITY", "https://api.krabcare.com/api/v1/ingest/quality")
GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY", "")
REQUEST_TIMEOUT = 10  # detik

# Retry buffer TETAP jalan berkala (bukan event-driven, karena kegagalan
# jaringan bukan "kejadian file berubah"). Tapi ini interval yang jarang
# dan ringan (cuma query SQLite lokal kalau buffer kosong).
BUFFER_RETRY_INTERVAL = 30  # detik

# ---------- State & Buffer Lokal ----------
STATE_FILE = "/home/pi/TA_Kepiting/kirim_ke_cloud/forwarder_state.json"
BUFFER_DB_PATH = "/home/pi/TA_Kepiting/kirim_ke_cloud/forwarder_buffer.db"

state_lock = threading.Lock()

# ---------- Session HTTP yang di-reuse (bukan requests.post() polos) ----------
# requests.post() langsung membuka koneksi TCP + TLS baru dari nol SETIAP kali
# dipanggil -- di jaringan seluler (GSM 4G/3G) yang kuotanya terbatas, biaya
# handshake TLS ini (beberapa KB per kali) bisa jauh lebih besar daripada body
# JSON yang sebenarnya mau dikirim (cuma ratusan byte - beberapa KB).
#
# Dengan satu objek Session yang dipakai berulang, urllib3 (dipakai internal
# oleh requests) menyimpan koneksi TCP+TLS di connection pool dan memakainya
# lagi untuk request berikutnya ke host yang sama (HTTP keep-alive), selama
# koneksi itu belum idle terlalu lama / belum diputus paksa oleh jaringan.
# Kalau koneksi memang sudah mati (mis. gara-gara GSM sempat putus beberapa
# menit), urllib3 otomatis membuka koneksi baru secara transparan -- jadi ini
# aman dipakai terus-menerus tanpa perlu logic reconnect manual.
_session = requests.Session()


# ---------- Util nama file ----------
def dapatkan_nama_file_jam(prefix: str, ekstensi: str, waktu: datetime) -> str:
    return f"{prefix}_{waktu.strftime('%Y-%m-%d_%H')}.{ekstensi}"


# ---------- State ----------
def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


# ---------- Buffer lokal untuk retry ----------
def init_buffer_db():
    os.makedirs(os.path.dirname(BUFFER_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(BUFFER_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS buffer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            catatan TEXT DEFAULT ''
        )
    """)
    # Tabel TERPISAH untuk quality (bukan kolom "jenis" di tabel yang sama):
    # payload readings itu list rata ({"readings": [...]}), payload quality
    # itu dict tiga list ({"classifications": [...], "predictions": [...],
    # "ammonia_risks": [...]}) — beda bentuk, jadi beda tabel supaya kode
    # baca-ulangnya tidak perlu cabang if/else di tengah query.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS buffer_quality (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            catatan TEXT DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


def simpan_ke_buffer(readings_list: list, catatan: str = ""):
    conn = sqlite3.connect(BUFFER_DB_PATH)
    conn.execute(
        "INSERT INTO buffer (payload, created_at, catatan) VALUES (?, ?, ?)",
        (json.dumps(readings_list), datetime.now(TIMEZONE).isoformat(timespec="seconds"), catatan),
    )
    conn.commit()
    conn.close()
    print(f"[BUFFERED] {len(readings_list)} reading disimpan lokal. {catatan}")


def simpan_ke_buffer_quality(payload: dict, catatan: str = ""):
    conn = sqlite3.connect(BUFFER_DB_PATH)
    conn.execute(
        "INSERT INTO buffer_quality (payload, created_at, catatan) VALUES (?, ?, ?)",
        (json.dumps(payload), datetime.now(TIMEZONE).isoformat(timespec="seconds"), catatan),
    )
    conn.commit()
    conn.close()
    jumlah = len(payload.get("classifications", [])) + len(payload.get("predictions", [])) + len(payload.get("ammonia_risks", []))
    print(f"[BUFFERED] {jumlah} baris quality disimpan lokal. {catatan}")


# ---------- Sanitasi nilai ----------
def sanitasi_reading(reading: dict) -> dict:
    ph = reading.get("ph")
    if ph is not None and not (0 <= ph <= 14):
        print(f"[WARNING] ph di luar rentang valid (0-14): {ph} -> dikirim sebagai null. "
              f"device={reading.get('device_code')} time={reading.get('time')}")
        reading["ph"] = None
    salinitas = reading.get("salinity_ppt")
    if salinitas is not None and salinitas < 0:
        print(f"[WARNING] salinity_ppt negatif: {salinitas} -> dikirim sebagai null. "
              f"device={reading.get('device_code')} time={reading.get('time')}")
        reading["salinity_ppt"] = None
    return reading


# ---------- Baca baris baru dari CSV readings sejak offset terakhir ----------
def baca_baris_baru(path_file: str, offset_lama: int):
    readings = []
    if not os.path.exists(path_file):
        return readings, offset_lama
    with open(path_file, "r", newline="", encoding="utf-8") as f:
        f.seek(offset_lama)
        lewati_baris_pertama = (offset_lama == 0)
        pos = offset_lama
        while True:
            # readline() + tell() SETELAH tiap baris (bukan f.tell() satu
            # kali setelah loop csv.DictReader selesai) — supaya offset
            # yang disimpan selalu persis di akhir baris LENGKAP terakhir
            # yang berhasil diparsing.
            #
            # Alasan perubahan: iterasi file/csv.reader lewat for-loop
            # memakai read-ahead buffering internal Python, jadi f.tell()
            # yang dipanggil SETELAH loop selesai tidak selalu menunjuk
            # tepat di akhir baris terakhir yang sungguh sudah dibaca --
            # apalagi kalau file sedang di-append proses lain (baca_
            # prediksi.py) di waktu yang hampir bersamaan. Ini bikin offset
            # yang tersimpan kadang tidak maju penuh, sehingga baris yang
            # SUDAH terkirim ke cloud ikut kebaca ulang di event berikutnya
            # dan dikirim lagi (lalu ditolak sebagai duplikat oleh backend).
            #
            # Dengan readline() manual, tiap baris punya posisi tell() yang
            # pasti akurat. Kalau baris terakhir yang terbaca ternyata belum
            # diakhiri newline (writer baru separuh menulis), kita berhenti
            # SEBELUM baris itu dan offset TIDAK ikut maju -- baris tsb akan
            # terbaca utuh di event berikutnya, bukan malah kelewat atau
            # dibaca setengah.
            baris = f.readline()
            if not baris:
                break
            if not baris.endswith("\n"):
                break

            pos_setelah_baris = f.tell()

            if lewati_baris_pertama:
                lewati_baris_pertama = False
                pos = pos_setelah_baris
                continue

            row = next(csv.DictReader([baris], fieldnames=CSV_FIELDNAMES))
            pos = pos_setelah_baris

            if not row.get("device_code") or not row.get("time"):
                continue
            try:
                reading = {
                    "device_code": row["device_code"],
                    "time": row["time"],
                    "ph": float(row["ph"]) if row.get("ph") not in (None, "") else None,
                    "temperature_c": float(row["temperature_c"]) if row.get("temperature_c") not in (None, "") else None,
                    "salinity_ppt": float(row["salinity_ppt"]) if row.get("salinity_ppt") not in (None, "") else None,
                }
            except (ValueError, TypeError) as e:
                print(f"[WARNING] Gagal parsing baris CSV, dilewati: {row} ({e})")
                continue
            readings.append(sanitasi_reading(reading))
        offset_baru = pos
    return readings, offset_baru


# ---------- Baca baris baru dari JSONL quality sejak offset terakhir ----------
def baca_baris_quality_baru(path_file: str, offset_lama: int):
    """Tiap baris di quality_*.jsonl = satu payload {classifications,
    predictions, ammonia_risks} dari SATU pemanggilan EdgePipeline.process().
    Beberapa baris baru digabung jadi SATU payload batch di sini, supaya
    satu event file-berubah (yang bisa membawa beberapa reading sekaligus
    kalau forwarder sempat idle) cukup satu kali POST, bukan satu POST per
    baris."""
    gabungan = {"classifications": [], "predictions": [], "ammonia_risks": []}
    if not os.path.exists(path_file):
        return gabungan, offset_lama

    with open(path_file, "r", encoding="utf-8") as f:
        f.seek(offset_lama)
        pos = offset_lama
        while True:
            # Sama seperti baca_baris_baru(): readline() + tell() per baris,
            # bukan f.tell() satu kali setelah loop "for baris in f:" selesai.
            baris = f.readline()
            if not baris:
                break
            if not baris.endswith("\n"):
                # Baris terakhir belum lengkap ditulis EdgePipeline —
                # jangan majukan offset, biar terbaca utuh di event berikutnya.
                break
            pos = f.tell()

            baris_bersih = baris.strip()
            if not baris_bersih:
                continue
            try:
                payload = json.loads(baris_bersih)
            except json.JSONDecodeError as e:
                print(f"[WARNING] Baris quality bukan JSON valid, dilewati: {e}")
                continue
            gabungan["classifications"].extend(payload.get("classifications", []))
            gabungan["predictions"].extend(payload.get("predictions", []))
            gabungan["ammonia_risks"].extend(payload.get("ammonia_risks", []))
        offset_baru = pos
    return gabungan, offset_baru


# ---------- Pengiriman ke cloud: readings ----------
def kirim_batch(readings_list: list) -> str:
    if not readings_list:
        return "ok"
    headers = {"X-API-Key": GATEWAY_API_KEY}
    payload = {"readings": readings_list}
    try:
        resp = _session.post(CLOUD_URL_READINGS, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Gagal konek ke cloud (readings): {e}")
        return "retry"
    if resp.status_code == 201:
        body = resp.json()
        print(f"[SENT] readings received={body.get('received')} inserted={body.get('inserted')} "
              f"unknown_device_codes={body.get('unknown_device_codes')} "
              f"skipped_duplicates={len(body.get('skipped_duplicates', []))}")
        if body.get("unknown_device_codes"):
            print(f"[WARNING] device_code belum terdaftar: {body['unknown_device_codes']}")
        return "ok"
    if resp.status_code == 401:
        print("[FATAL] 401 Unauthorized (readings) — cek GATEWAY_API_KEY.")
        return "fatal"
    if resp.status_code == 422:
        print(f"[FATAL] 422 Unprocessable Entity (readings): {resp.text}")
        return "fatal"
    print(f"[ERROR] Status tidak terduga (readings) {resp.status_code}: {resp.text}")
    return "retry"


# ---------- Pengiriman ke cloud: quality ----------
def kirim_batch_quality(payload: dict) -> str:
    if not (payload.get("classifications") or payload.get("predictions") or payload.get("ammonia_risks")):
        return "ok"
    headers = {"X-API-Key": GATEWAY_API_KEY}
    try:
        resp = _session.post(CLOUD_URL_QUALITY, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Gagal konek ke cloud (quality): {e}")
        return "retry"
    if resp.status_code == 201:
        body = resp.json()
        print(
            "[SENT] quality "
            f"classifications={body.get('inserted_classifications')}/{body.get('received_classifications')} "
            f"predictions={body.get('inserted_predictions')}/{body.get('received_predictions')} "
            f"ammonia_risks={body.get('inserted_ammonia_risks')}/{body.get('received_ammonia_risks')}"
        )
        if body.get("unknown_device_codes"):
            print(f"[WARNING] device_code belum terdaftar: {body['unknown_device_codes']}")
        return "ok"
    if resp.status_code == 401:
        print("[FATAL] 401 Unauthorized (quality) — cek GATEWAY_API_KEY.")
        return "fatal"
    if resp.status_code == 422:
        print(f"[FATAL] 422 Unprocessable Entity (quality): {resp.text}")
        return "fatal"
    print(f"[ERROR] Status tidak terduga (quality) {resp.status_code}: {resp.text}")
    return "retry"


def kirim_ulang_buffer():
    conn = sqlite3.connect(BUFFER_DB_PATH)
    rows = conn.execute("SELECT id, payload FROM buffer ORDER BY id ASC").fetchall()
    if not rows:
        conn.close()
        return
    print(f"[BUFFER] Mencoba kirim ulang {len(rows)} batch readings tertunda...")
    for row_id, payload_str in rows:
        readings_list = json.loads(payload_str)
        hasil = kirim_batch(readings_list)
        if hasil == "ok":
            conn.execute("DELETE FROM buffer WHERE id = ?", (row_id,))
            conn.commit()
        elif hasil == "fatal":
            print(f"[BUFFER] Batch readings id={row_id} gagal permanen, tetap di buffer untuk dicek manual.")
            continue
        else:
            print("[BUFFER] Masih gagal konek (readings), coba lagi nanti.")
            break
    conn.close()


def kirim_ulang_buffer_quality():
    conn = sqlite3.connect(BUFFER_DB_PATH)
    rows = conn.execute("SELECT id, payload FROM buffer_quality ORDER BY id ASC").fetchall()
    if not rows:
        conn.close()
        return
    print(f"[BUFFER] Mencoba kirim ulang {len(rows)} batch quality tertunda...")
    for row_id, payload_str in rows:
        payload = json.loads(payload_str)
        hasil = kirim_batch_quality(payload)
        if hasil == "ok":
            conn.execute("DELETE FROM buffer_quality WHERE id = ?", (row_id,))
            conn.commit()
        elif hasil == "fatal":
            print(f"[BUFFER] Batch quality id={row_id} gagal permanen, tetap di buffer untuk dicek manual.")
            continue
        else:
            print("[BUFFER] Masih gagal konek (quality), coba lagi nanti.")
            break
    conn.close()


# ---------- Bagian event-driven (inotify via watchdog) ----------
class CSVHandler(FileSystemEventHandler):
    """
    Dipanggil OTOMATIS oleh kernel (lewat watchdog) setiap kali ada file
    di OUTPUT_DIR yang berubah (ditulis) atau baru dibuat (pergantian jam).
    Tidak ada loop polling — proses ini idle sampai dibangunkan oleh event.

    Menangani DUA pola nama file sekaligus, dari satu handler yang sama —
    keduanya lahir dari OUTPUT_DIR yang sama, jadi satu observer inotify
    cukup, tinggal dicabangkan di _proses_file() berdasarkan awalan nama.
    """

    def __init__(self, state: dict):
        self.state = state

    def _proses_file(self, path_file: str):
        nama_file = os.path.basename(path_file)
        if nama_file.startswith("readings_") and nama_file.endswith(".csv"):
            self._proses_file_readings(path_file, nama_file)
        elif nama_file.startswith("quality_") and nama_file.endswith(".jsonl"):
            self._proses_file_quality(path_file, nama_file)
        # File lain yang bukan output baca_prediksi.py (mis. .tmp, log lain) diabaikan.

    def _proses_file_readings(self, path_file: str, nama_file: str):
        with state_lock:
            offset_lama = self.state.get(nama_file, 0)
            readings_baru, offset_baru = baca_baris_baru(path_file, offset_lama)
            if not readings_baru:
                return
            self.state[nama_file] = offset_baru
            save_state(self.state)
        print(f"[FOUND] {len(readings_baru)} reading baru dari {nama_file} (event)")
        hasil = kirim_batch(readings_baru)
        if hasil == "retry":
            simpan_ke_buffer(readings_baru, catatan="gagal koneksi")
        elif hasil == "fatal":
            simpan_ke_buffer(readings_baru, catatan="fatal - perlu dicek manual")

    def _proses_file_quality(self, path_file: str, nama_file: str):
        with state_lock:
            offset_lama = self.state.get(nama_file, 0)
            payload_baru, offset_baru = baca_baris_quality_baru(path_file, offset_lama)
            jumlah = len(payload_baru["classifications"]) + len(payload_baru["predictions"]) + len(payload_baru["ammonia_risks"])
            if jumlah == 0:
                return
            self.state[nama_file] = offset_baru
            save_state(self.state)
        print(f"[FOUND] {jumlah} baris quality baru dari {nama_file} (event)")
        hasil = kirim_batch_quality(payload_baru)
        if hasil == "retry":
            simpan_ke_buffer_quality(payload_baru, catatan="gagal koneksi")
        elif hasil == "fatal":
            simpan_ke_buffer_quality(payload_baru, catatan="fatal - perlu dicek manual")

    def on_modified(self, event):
        if not event.is_directory:
            self._proses_file(event.src_path)

    def on_created(self, event):
        # Terpicu saat file jam baru pertama kali dibuat (pergantian jam)
        if not event.is_directory:
            self._proses_file(event.src_path)


def thread_retry_buffer():
    """
    Thread terpisah yang jalan berkala HANYA untuk retry buffer (kegagalan
    jaringan). Ini bukan "polling file" — cuma cek tabel SQLite lokal yang
    sangat ringan, dan hanya melakukan request jaringan kalau memang ada
    sesuatu yang perlu dikirim ulang. Readings dan quality dicoba di siklus
    yang sama, tapi lewat tabel/fungsi masing-masing.
    """
    while True:
        kirim_ulang_buffer()
        kirim_ulang_buffer_quality()
        time.sleep(BUFFER_RETRY_INTERVAL)


def main():
    if not GATEWAY_API_KEY:
        print("[WARNING] GATEWAY_API_KEY belum di-set. Request kemungkinan akan ditolak 401.")

    init_buffer_db()
    state = load_state()

    # Proses dulu data yang mungkin sudah ada di file jam sekarang SEBELUM
    # observer mulai memantau — supaya tidak menunggu event berikutnya
    # untuk data yang sudah tertulis sebelum forwarder ini dinyalakan.
    handler = CSVHandler(state)
    waktu_sekarang = datetime.now(TIMEZONE)
    path_readings_sekarang = os.path.join(OUTPUT_DIR, dapatkan_nama_file_jam("readings", "csv", waktu_sekarang))
    path_quality_sekarang = os.path.join(OUTPUT_DIR, dapatkan_nama_file_jam("quality", "jsonl", waktu_sekarang))
    if os.path.exists(path_readings_sekarang):
        handler._proses_file(path_readings_sekarang)
    if os.path.exists(path_quality_sekarang):
        handler._proses_file(path_quality_sekarang)

    # Thread retry buffer, jalan independen di background
    threading.Thread(target=thread_retry_buffer, daemon=True).start()

    # Observer inotify — INI YANG MENGGANTIKAN POLLING
    observer = Observer()
    observer.schedule(handler, OUTPUT_DIR, recursive=False)
    observer.start()

    print(f"[OK] Forwarder aktif (EVENT-DRIVEN, bukan polling). Memantau {OUTPUT_DIR}")
    print(f"[OK] Endpoint readings: {CLOUD_URL_READINGS}")
    print(f"[OK] Endpoint quality : {CLOUD_URL_QUALITY}")

    try:
        while True:
            # Main thread cuma menunggu; semua kerja nyata terjadi di
            # callback observer (dipicu kernel) dan thread retry buffer.
            time.sleep(3600)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
