# WLR forecast — Raspberry Pi 5 (edge)

Forecast WLR 15/30/60 menit yang jalan LANGSUNG di Raspi (gateway), bukan di backend cloud.
`raspi/` itu kode produksi yang beneran dikirim ke hardware.

## Isi

- `wlr_forecast.py` — forecast WLR 15/30/60 menit (ph, suhu, salinitas).
- `fuzzy_quality.py` — klasifikasi Mamdani (baik/sedang/buruk), berdiri sendiri.
- `ammonia_nh3.py` — estimasi fraksi risiko amonia (NH3), duplikat dari
  backend/app/services/ammonia_speciation.py.
- `edge_pipeline.py` — satu titik masuk yang menyatukan tiga di atas: dari satu reading
  mentah, hasilkan payload lengkap siap POST ke `/api/v1/ingest/quality`.
- `test_reference_values.py` — angka acuan (sama seperti backend/tests/test_ammonia_speciation.py)
  buat memastikan dua salinan (di sini vs backend) tetap identik hasilnya.
- `krabcare-wlr.service.example` — contoh unit systemd, kalau nanti mau dijalankan sebagai
  service yang auto-start & auto-restart.

Kelima file `.py` **satu paket, berdiri sendiri** (tidak bergantung file lain di repo ini),
murni stdlib. Copy folder `raspi/` ini SAJA ke Raspi, tidak perlu bawa seisi repo.

## Perubahan kontrak ingest (PENTING)

Backend TIDAK LAGI menghitung klasifikasi Mamdani, forecast, dan risiko amonia sendiri
(lihat rangkuman.md untuk histori kenapa). Ketiganya sekarang WAJIB dihitung di Raspi
(pakai `edge_pipeline.py`) dan dikirim lewat endpoint yang SUDAH ADA sejak awal:

```
POST /api/v1/ingest/quality
Header: X-API-Key: <GATEWAY_API_KEY yang sama dengan /ingest/readings>
Body: payload dari EdgePipeline.process(...) (buang key "_anomaly_now"/"_anomaly_forecast",
      itu cuma info tambahan buat kalian, backend tidak menerimanya)
```

Endpoint `/api/v1/ingest/readings` (raw sensor) TIDAK BERUBAH — tetap kirim seperti biasa,
INI TAMBAHAN, bukan pengganti. Jadi tiap siklus baca sensor sekarang mengirim DUA request:
1. `POST /ingest/readings` — data mentah (seperti sekarang)
2. `POST /ingest/quality` — hasil `EdgePipeline.process(...)` (BARU)

## Cara pakai cepat (tanpa hardware, buat ngetes dulu)

```bash
python3 wlr_forecast.py
```
Ini jalanin simulasi 75 menit data + print forecast tiap 15 menit. Kalau ini jalan tanpa
error, artinya file-nya siap dipakai — tinggal disambung ke pembacaan sensor asli.

## Cara integrasi ke script gateway kalian yang sudah ada

```python
import json
import time
import urllib.request
from datetime import datetime, timezone

from edge_pipeline import EdgePipeline

API_BASE = "https://api.krabcare.com/api/v1"
API_KEY = "isi_dengan_GATEWAY_API_KEY_yang_sama_di_.env_backend"

pipeline = EdgePipeline(device_code="54D660E9BFB4")  # ganti sesuai device_code kalian


def post(path: str, payload: dict) -> None:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()  # lempar HTTPError sendiri kalau status bukan 2xx


while True:
    # GANTI bagian ini dengan cara Raspi kalian baca data dari ESP32
    # (serial/UART, LoRa, MQTT, dst — apa pun yang sudah jalan sekarang)
    ph, suhu, sal = baca_sensor()  # <- fungsi kalian sendiri

    waktu = datetime.now(timezone.utc)  # HARUS timezone-aware

    # 1) raw reading, seperti sekarang, TIDAK berubah
    post("/ingest/readings", {"readings": [{
        "device_code": pipeline.device_code, "time": waktu.isoformat(),
        "ph": ph, "temperature_c": suhu, "salinity_ppt": sal,
    }]})

    # 2) klasifikasi + forecast 15/30/60 + risiko amonia, BARU
    hasil = pipeline.process(waktu, ph=ph, temperature_c=suhu, salinity_ppt=sal)
    post("/ingest/quality", {
        "classifications": hasil["classifications"],
        "predictions": hasil["predictions"],
        "ammonia_risks": hasil["ammonia_risks"],
    })

    time.sleep(60)  # sesuaikan sama interval reading gateway kalian yang sekarang
```

Kalau gateway kalian sudah pakai library `requests`, ganti fungsi `post()` di atas dengan
`requests.post(url, json=payload, headers={...})` — sama saja, cuma lebih ringkas.

`WLRForecaster` (dipakai `EdgePipeline` di dalam) tetap bisa dipakai sendirian kalau kalian
cuma butuh forecast tanpa klasifikasi/amonia — lihat bagian bawah `wlr_forecast.py`.

## Kenapa cuma 3 horizon ini (15/30/60 menit), dan kenapa window-nya segitu

`HORIZONS_MINUTES = (15, 30, 60)` di-hardcode sesuai permintaan — bukan parameter yang bisa
diubah dari luar tanpa edit kode (sengaja, biar jelas & tidak "diam-diam" berubah).

Tiap horizon punya `window_minutes`/`half_life_minutes` sendiri di `DEFAULT_HORIZON_CONFIG`
(heuristik: window = horizon, half-life = window/3). Ini BELUM divalidasi dengan data
riil berjam-jam — begitu data kalian sudah lebih panjang dari yang di `data/` sekarang
(~105 menit), validasi ulang kombinasi window/half-life mana yang RMSE-nya paling kecil
per horizon, baru sesuaikan angkanya di `DEFAULT_HORIZON_CONFIG` sini kalau perlu.

## Kalau mau jalan sebagai service (auto-start saat boot, auto-restart kalau crash)

1. Copy `wlr_forecast.py` (+ script gateway kalian yang sudah mengimpornya) ke Raspi, misal
   ke `/home/pi/krabcare-gateway/`
2. Copy `krabcare-wlr.service.example` ke `/etc/systemd/system/krabcare-wlr.service`
   (sesuaikan dulu path `WorkingDirectory`/`ExecStart` di dalamnya)
3. ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now krabcare-wlr
   sudo journalctl -u krabcare-wlr -f   # buat lihat log-nya live
   ```

## Batasan yang perlu diketahui

- Forecast pakai ekstrapolasi garis lurus dari tren terakhir — kalau kondisi air berubah
  MENDADAK (bukan tren halus), prediksi 60 menit ke depan bisa jauh meleset. Ini batasan
  metode, bukan bug.
- Belum ada validasi kalibrasi (`d_min`/`d_max` semacam di FTS) — WLR nggak butuh universe
  tetap kaya FTS, tapi tetap butuh histori riil buat window/half-life di atas supaya masuk
  akal buat kondisi air kolam kalian.
