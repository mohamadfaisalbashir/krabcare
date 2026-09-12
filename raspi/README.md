# WLR forecast: Raspberry Pi 5 (edge)

Forecast WLR 15/30/60 menit yang jalan di Raspi (gateway), bukan di backend.
Isi `raspi/` adalah kode produksi yang dikirim ke hardware.

## Isi

- `wlr_forecast.py`, forecast WLR 15/30/60 menit (ph, suhu, salinitas).
- `fuzzy_quality.py`, klasifikasi Mamdani (baik/sedang/buruk), berdiri sendiri.
- `ammonia_nh3.py`, estimasi fraksi risiko amonia (NH3), duplikat dari
  backend/app/services/ammonia_speciation.py.
- `edge_pipeline.py`, satu titik masuk yang menyatukan tiga di atas: dari satu reading
  mentah, hasilkan payload lengkap siap POST ke `/api/v1/ingest/quality`.
- `test_reference_values.py`, angka acuan (sama dengan backend/tests/test_ammonia_speciation.py)
  untuk memastikan hasil dua salinan rumus tetap identik.
- `krabcare-wlr.service.example`, contoh unit systemd untuk menjalankannya sebagai
  service yang auto-start dan auto-restart.

Semua berkas `.py` di sini berdiri sendiri, tidak bergantung berkas lain di repo, dan
murni stdlib. Cukup salin folder `raspi/` ke Raspi.

## Perubahan kontrak ingest

Backend tidak lagi menghitung klasifikasi Mamdani, forecast, dan risiko amonia sendiri.
Ketiganya dihitung di Raspi lewat `edge_pipeline.py` lalu dikirim ke:

```
POST /api/v1/ingest/quality
Header: X-API-Key: <GATEWAY_API_KEY yang sama dengan /ingest/readings>
Body: payload dari EdgePipeline.process(...). Buang key "_anomaly_now" dan
      "_anomaly_forecast", itu info lokal yang tidak diterima backend.
```

Endpoint `/api/v1/ingest/readings` (raw sensor) tidak berubah. Ini tambahan, bukan
pengganti, jadi tiap siklus baca sensor mengirim dua request:
1. `POST /ingest/readings`, data mentah
2. `POST /ingest/quality`, hasil `EdgePipeline.process(...)`

## Cara pakai cepat (tanpa hardware)

```bash
python3 wlr_forecast.py
```
Menjalankan simulasi 75 menit data dan mencetak forecast tiap 15 menit. Kalau jalan tanpa
error, berkasnya siap disambung ke pembacaan sensor asli.

## Integrasi ke script gateway

```python
import json
import time
import urllib.request
from datetime import datetime, timezone

from edge_pipeline import EdgePipeline

API_BASE = "https://api.krabcare.com/api/v1"
API_KEY = "isi_dengan_GATEWAY_API_KEY_yang_sama_di_.env_backend"

pipeline = EdgePipeline(device_code="54D660E9BFB4")  # ganti sesuai device_code


def post(path: str, payload: dict) -> None:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": API_KEY},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()  # melempar HTTPError sendiri kalau status bukan 2xx


while True:
    # Ganti dengan cara Raspi membaca data dari ESP32
    # (serial/UART, LoRa, MQTT, apa pun yang sudah dipakai)
    ph, suhu, sal = baca_sensor()  # fungsi sendiri

    waktu = datetime.now(timezone.utc)  # harus timezone-aware

    # 1) raw reading, tidak berubah
    post("/ingest/readings", {"readings": [{
        "device_code": pipeline.device_code, "time": waktu.isoformat(),
        "ph": ph, "temperature_c": suhu, "salinity_ppt": sal,
    }]})

    # 2) klasifikasi + forecast 15/30/60 + risiko amonia
    hasil = pipeline.process(waktu, ph=ph, temperature_c=suhu, salinity_ppt=sal)
    post("/ingest/quality", {
        "classifications": hasil["classifications"],
        "predictions": hasil["predictions"],
        "ammonia_risks": hasil["ammonia_risks"],
    })

    time.sleep(60)  # sesuaikan dengan interval reading gateway
```

Kalau gateway sudah memakai library `requests`, fungsi `post()` di atas bisa diganti
`requests.post(url, json=payload, headers={...})`.

`WLRForecaster` (dipakai di dalam `EdgePipeline`) masih bisa dipakai sendirian kalau cuma
butuh forecast tanpa klasifikasi dan amonia, lihat bagian bawah `wlr_forecast.py`.

## Kenapa cuma 15/30/60 menit, dan kenapa window-nya segitu

`HORIZONS_MINUTES = (15, 30, 60)` di-hardcode, bukan parameter yang bisa diubah dari luar
tanpa mengedit kode.

Tiap horizon punya `window_minutes` dan `half_life_minutes` sendiri di
`DEFAULT_HORIZON_CONFIG`, dengan heuristik window = horizon dan half-life = window/3.
Angka itu belum divalidasi dengan data riil berjam-jam. Begitu datanya lebih panjang dari
yang ada sekarang (~105 menit), cari kombinasi window/half-life dengan RMSE terkecil per
horizon lalu sesuaikan `DEFAULT_HORIZON_CONFIG`.

## Menjalankannya sebagai service (auto-start saat boot, auto-restart kalau crash)

1. Salin `wlr_forecast.py` dan script gateway yang mengimpornya ke Raspi, misalnya ke
   `/home/pi/krabcare-gateway/`
2. Salin `krabcare-wlr.service.example` ke `/etc/systemd/system/krabcare-wlr.service`,
   sesuaikan dulu path `WorkingDirectory` dan `ExecStart` di dalamnya
3. ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now krabcare-wlr
   sudo journalctl -u krabcare-wlr -f   # lihat log live
   ```

## Batasan yang perlu diketahui

- Forecast memakai ekstrapolasi garis lurus dari tren terakhir, jadi perubahan kondisi
  air yang mendadak bisa membuat prediksi 60 menit meleset jauh. Ini batasan metode.
- Belum ada validasi kalibrasi. WLR tidak butuh universe tetap seperti FTS, tapi
  window/half-life di atas tetap perlu disetel dengan histori riil kolamnya.
