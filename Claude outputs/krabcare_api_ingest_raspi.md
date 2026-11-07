# KrabCare: Dokumentasi API Ingest untuk Raspberry Pi + SIM7600G

Dokumen ini menjawab kebutuhan pengujian pengiriman data sensor dari Raspberry Pi lewat jaringan seluler (SIM7600G) ke backend KrabCare. Isinya diambil dari kode backend yang sedang berjalan (FastAPI, `backend/app/routers/ingest.py` dan `backend/app/schemas/`).

---

## 1. Base URL

**Ya.** Base URL API adalah:

```
https://api.krabcare.com/api/v1
```

- Perhatikan ada `/api` sebelum `/v1`. Memanggil `https://api.krabcare.com/v1/...` akan menghasilkan **404 Not Found**.
- Pengecualian: health check ada di `https://api.krabcare.com/health` (tanpa `/api/v1`). Endpoint ini cocok untuk tes koneksi paling awal karena tidak butuh autentikasi:

```bash
curl -i https://api.krabcare.com/health
# HTTP/2 200
# {"status":"ok"}
```

---

## 2. Endpoint penerima data (POST)

Ada dua endpoint ingest. Keduanya khusus untuk gateway (Raspberry Pi).

| Endpoint | Isi | Kapan dipakai |
|---|---|---|
| `POST https://api.krabcare.com/api/v1/ingest/readings` | **Data sensor mentah**: pH, suhu, salinitas | **Ini yang diuji pertama.** Cukup endpoint ini untuk menguji pengiriman data sensor. |
| `POST https://api.krabcare.com/api/v1/ingest/quality` | Hasil olahan di Raspi: klasifikasi fuzzy, prediksi WLR 15/30/60 menit, risiko amonia | Dikirim otomatis oleh `cloud_forwarder_watch.py` dari keluaran `edge_pipeline.py`. Tidak perlu dibuat manual saat menguji koneksi. |

> Catatan: skrip lama `raspi-data/uji-api` memakai alamat `https://krabcare.com/dashboard/api/data` dengan header `X-Gateway`. **Alamat dan header itu sudah tidak berlaku.** Pakai endpoint dan header di dokumen ini.

---

## 3. Format JSON

### 3.1 `POST /ingest/readings`

Body berupa objek dengan satu field `readings`, berisi **daftar** pembacaan (minimal 1). Satu request boleh membawa banyak pembacaan sekaligus, termasuk dari beberapa device.

```json
{
  "readings": [
    {
      "device_code": "54D660E9BFB4",
      "time": "2026-11-07T14:30:00+07:00",
      "ph": 7.92,
      "temperature_c": 28.4,
      "salinity_ppt": 19.5
    }
  ]
}
```

| Field | Tipe | Wajib | Aturan |
|---|---|---|---|
| `device_code` | string | Ya | MAC ESP32 tanpa titik dua, huruf besar, contoh `54D660E9BFB4`. **Harus sudah didaftarkan admin** (lihat bagian 7). Pencocokannya case-sensitive. |
| `time` | string (ISO 8601) | Ya | Waktu pembacaan. **Sertakan zona waktu**, misalnya `+07:00` untuk WIB. Waktu tanpa zona dianggap UTC, sehingga jamnya bisa bergeser 7 jam. |
| `ph` | number atau `null` | Tidak | 0–14. Di luar rentang ditolak 422. |
| `temperature_c` | number atau `null` | Tidak | Suhu dalam °C. |
| `salinity_ppt` | number atau `null` | Tidak | ≥ 0, dalam ppt. |

Sensor yang gagal membaca boleh dikirim `null`; baris lainnya tetap tersimpan.

Kombinasi `device_code` + `time` bersifat unik. Mengirim ulang data yang sama **tidak** membuat duplikat; data itu dilaporkan di `skipped_duplicates`. Jadi aman untuk mencoba ulang setelah koneksi seluler putus.

### 3.2 `POST /ingest/quality` (untuk referensi)

```json
{
  "classifications": [
    {
      "device_code": "54D660E9BFB4",
      "time": "2026-11-07T14:30:00+07:00",
      "sensor_reading_time": "2026-11-07T14:30:00+07:00",
      "quality_score": 22.14,
      "quality_category": "baik",
      "membership_degrees": null,
      "model_version": "fuzzy-logic"
    }
  ],
  "predictions": [
    {
      "device_code": "54D660E9BFB4",
      "time": "2026-11-07T14:30:00+07:00",
      "target_time": "2026-11-07T14:45:00+07:00",
      "horizon_minutes": 15,
      "predicted_quality_score": 25.0,
      "predicted_category": "baik",
      "predicted_ph": 7.95,
      "predicted_temperature_c": 28.6,
      "predicted_salinity_ppt": 19.4,
      "model_version": "wlr"
    }
  ],
  "ammonia_risks": [
    {
      "device_code": "54D660E9BFB4",
      "time": "2026-11-07T14:30:00+07:00",
      "target_time": "2026-11-07T14:30:00+07:00",
      "horizon_minutes": 0,
      "input_ph": 7.92,
      "input_temperature_c": 28.4,
      "input_salinity_ppt": 19.5,
      "fraction_nh3_pct": 5.1,
      "pka": 9.2,
      "risk_level": "normal",
      "in_valid_range": true,
      "model_version": "speciation-bb78"
    }
  ]
}
```

- Ketiga daftar boleh diisi sebagian, tapi **minimal satu** tidak boleh kosong.
- `quality_category` dan `predicted_category`: `baik` (Aman), `sedang` (Waspada), atau `buruk` (Bahaya). `quality_score` 0–100.
- `horizon_minutes`: `0` = kondisi terukur (khusus `ammonia_risks`), `15`/`30`/`60` = prediksi.
- `risk_level`: `normal`, `perhatian`, atau `berbahaya`.
- Nilai-nilai di contoh hanya ilustrasi. Payload asli dibuat otomatis oleh `EdgePipeline.process()` di Raspi.

---

## 4. Autentikasi

Endpoint ingest memakai **API Key di header**, bukan Bearer Token.

```
X-API-Key: <GATEWAY_API_KEY>
Content-Type: application/json
```

- Nilainya harus **sama persis** dengan `GATEWAY_API_KEY` di file `.env` VPS (`/opt/krabcare/.env`). Minta nilainya ke pengelola VPS; jangan ditulis di dokumen, repo, atau laporan.
- Di Raspberry Pi, kunci ini disimpan di `/home/pi/TA_Kepiting/.env` dan dibaca `cloud_forwarder_watch.py` lewat systemd (`EnvironmentFile`).
- Bearer Token (JWT) hanya dipakai aplikasi web dan mobile setelah pengguna login. Raspberry Pi tidak memakainya.

---

## 5. Contoh request dan response

### 5.1 Dengan curl (dari Raspberry Pi)

```bash
API_KEY='isi_dengan_GATEWAY_API_KEY'

curl -sS -X POST https://api.krabcare.com/api/v1/ingest/readings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "readings": [
          {"device_code": "54D660E9BFB4",
           "time": "'"$(date --iso-8601=seconds)"'",
           "ph": 7.92, "temperature_c": 28.4, "salinity_ppt": 19.5}
        ]
      }' \
  -w "\nHTTP %{http_code} | total %{time_total}s\n"
```

`date --iso-8601=seconds` menghasilkan waktu sekarang lengkap dengan zona, misalnya `2026-11-07T14:30:00+07:00`. Opsi `-w` menampilkan kode HTTP dan lama request, berguna untuk mencatat latensi jaringan seluler.

### 5.2 Dengan Python (sama seperti forwarder)

```python
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

URL = "https://api.krabcare.com/api/v1/ingest/readings"
API_KEY = os.environ["GATEWAY_API_KEY"]

payload = {
    "readings": [
        {
            "device_code": "54D660E9BFB4",
            "time": datetime.now(ZoneInfo("Asia/Jakarta")).isoformat(timespec="seconds"),
            "ph": 7.92,
            "temperature_c": 28.4,
            "salinity_ppt": 19.5,
        }
    ]
}

session = requests.Session()  # koneksi TLS dipakai ulang, hemat kuota seluler
resp = session.post(URL, json=payload, headers={"X-API-Key": API_KEY}, timeout=10)
print(resp.status_code, resp.json())
```

### 5.3 Response

**Berhasil, `201 Created`:**

```json
{
  "received": 1,
  "inserted": 1,
  "unknown_device_codes": [],
  "skipped_duplicates": []
}
```

| Field | Arti |
|---|---|
| `received` | Jumlah pembacaan yang diterima di request ini |
| `inserted` | Jumlah yang benar-benar disimpan ke database |
| `unknown_device_codes` | `device_code` yang **belum didaftarkan**. Datanya **tidak disimpan**. |
| `skipped_duplicates` | Pembacaan yang sudah pernah tersimpan (`device_code` + `time` sama), dilewati |

**Penting:** status `201` belum tentu berarti data tersimpan. Contoh untuk device yang belum terdaftar:

```json
{
  "received": 1,
  "inserted": 0,
  "unknown_device_codes": ["D8147DA99B20"],
  "skipped_duplicates": []
}
```

Selalu periksa `inserted` dan `unknown_device_codes`.

**Gagal:**

| Status | Penyebab | Contoh body |
|---|---|---|
| `401 Unauthorized` | Header `X-API-Key` tidak ada atau salah | `{"detail": "API key gateway tidak valid"}` |
| `422 Unprocessable Entity` | Format JSON salah: field wajib tidak ada, `readings` kosong, pH di luar 0–14, salinitas negatif, format waktu salah | `{"detail": [{"loc": ["body", "readings", 0, "ph"], "msg": "...", ...}]}` |
| `404 Not Found` | Path salah, misalnya tanpa `/api` | `{"detail": "Not Found"}` |

---

## 6. Dokumentasi Swagger / OpenAPI

Backend FastAPI menyediakan dokumentasi otomatis (alamatnya **tanpa** `/api/v1`):

| Alamat | Isi |
|---|---|
| `https://api.krabcare.com/docs` | Swagger UI, bisa mencoba request langsung dari browser |
| `https://api.krabcare.com/redoc` | Dokumentasi versi ReDoc |
| `https://api.krabcare.com/openapi.json` | Spesifikasi OpenAPI, bisa diimpor ke Postman |

Di Swagger UI, endpoint `/api/v1/ingest/readings` menampilkan parameter header `X-API-Key`. Isi nilainya sebelum menekan **Execute**.

Kalau alamat-alamat ini tidak terbuka, kemungkinan dokumentasi dinonaktifkan di server. Gunakan dokumen ini sebagai acuan.

---

## 7. Apakah endpoint sudah siap?

**Ya.** Kedua endpoint ingest sudah berjalan di production dan menyimpan ke database PostgreSQL + TimescaleDB. Endpoint yang sama sudah dipakai `cloud_forwarder_watch.py` di Raspberry Pi.

Syarat agar data benar-benar tersimpan dan tampil:

1. **`device_code` sudah didaftarkan** admin di menu **Perangkat** (web atau mobile). Tanpa ini data dibuang dan muncul di `unknown_device_codes`. Data yang terbuang tidak dikirim ulang setelah device didaftarkan.
2. **Device dihubungkan ke kolam** milik pengguna, agar datanya tampil di dashboard dan memicu notifikasi.
3. Header `X-API-Key` benar.

Setiap pembacaan yang tersimpan juga memperbarui waktu **"Terakhir aktif"** device di menu Perangkat.

### Cara memastikan data sudah masuk database

Endpoint baca `GET /readings` juga menerima `X-API-Key` gateway, jadi bisa dipakai langsung dari Raspberry Pi:

```bash
curl -sS "https://api.krabcare.com/api/v1/readings?device_code=54D660E9BFB4&limit=5" \
  -H "X-API-Key: $API_KEY"
```

Contoh response (terbaru dulu):

```json
[
  {
    "device_id": 1,
    "device_code": "54D660E9BFB4",
    "time": "2026-11-07T07:30:00Z",
    "received_at": "2026-11-07T07:30:01.842Z",
    "ph": 7.92,
    "temperature_c": 28.4,
    "salinity_ppt": 19.5
  }
]
```

- `time` ditampilkan dalam UTC (`Z`). `07:30Z` = `14:30` WIB.
- Selisih `received_at - time` adalah latensi pengiriman dari Raspberry Pi ke server, termasuk jaringan seluler. Angka ini bisa dipakai untuk tabel pengujian.
- Pengecekan lain: buka menu **Perangkat** sebagai admin (lihat "Terakhir aktif"), atau dashboard akun pemilik kolam.

### Saran untuk pengujian

- Pakai `device_code` yang memang terdaftar. Kalau perlu device khusus uji, daftarkan sebagai device terpisah. Menghapus device itu nanti **ikut menghapus semua datanya**, jadi jangan gunakan device kolam asli untuk data uji.
- Data uji akan masuk ke database production dan tampil di dashboard kolam yang terhubung.

---

## 8. Kode frontend

Frontend (web dan mobile) **tidak mengirim data sensor**. Frontend hanya **membaca** data dengan Bearer Token (JWT) dari login pengguna. Contoh dari aplikasi mobile (`mobile/lib/api.dart`):

```dart
// GET /readings dengan JWT pengguna
Future<List<Json>> getReadings({int? deviceId, int? limit, ...}) async => _list(
  await _request('GET', '/readings', query: {'device_id': deviceId, 'limit': limit, ...}),
);
// _request menambahkan header: Authorization: Bearer <token>
```

Contoh kode **pengirim** yang sudah berjalan adalah forwarder di Raspberry Pi (`raspi/cloud_forwarder_watch.py`, fungsi `kirim_batch`):

```python
def kirim_batch(readings_list: list) -> str:
    headers = {"X-API-Key": GATEWAY_API_KEY}
    payload = {"readings": readings_list}
    resp = _session.post(CLOUD_URL_READINGS, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    if resp.status_code == 201:
        body = resp.json()
        # cek body["inserted"] dan body["unknown_device_codes"]
        return "ok"
    if resp.status_code in (401, 422):
        return "fatal"   # kunci salah / format salah: disimpan ke buffer untuk dicek manual
    return "retry"       # gangguan jaringan / server: dicoba ulang tiap 30 detik
```

Forwarder ini juga menyimpan data ke buffer SQLite lokal saat koneksi seluler putus, lalu mengirim ulang otomatis.
