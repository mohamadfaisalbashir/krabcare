# sismon_kepiting

Sistem monitoring kualitas air untuk budidaya kepiting sistem vertikal, dikembangkan
bekerja sama dengan Supermarket Kepiting Surabaya.

## Tech Stack

- **Firmware** (di luar scope README ini): ESP32C3 (slave node per level) + ESP32
  (master node) + Raspberry Pi (gateway)
- **Backend**: FastAPI + PostgreSQL/TimescaleDB
- **Web**: Next.js
- **Mobile**: Flutter
- **ML**: fuzzy logic Mamdani (klasifikasi kualitas air real-time) + fuzzy time
  series metode Chen (prediksi tren jangka pendek)

## Setup Lokal

Asumsi Docker & Docker Compose sudah terinstall.

```bash
cp .env.example .env   # opsional — default docker-compose sudah jalan tanpa ini untuk dev
docker compose up --build -d
```

**PENTING** — folder `database/init/*.sql` **hanya auto-jalan sekali**, saat volume
`pgdata` masih kosong (fresh clone). Kalau nanti ada file SQL baru ditambahkan
*setelah* volume pernah dibuat (mis. Anda `git pull` dan ada migrasi baru), file itu
**tidak otomatis jalan** — harus di-apply manual:

```bash
docker compose exec db psql -U sismon_kepiting -d sismon_kepiting_db -f /docker-entrypoint-initdb.d/<nama_file>.sql
```

Ini poin yang paling sering bikin bingung anggota tim baru — kalau endpoint tiba-tiba
error "relation does not exist" padahal kodenya sudah benar, ini penyebabnya.

Cek backend hidup:

```bash
curl http://localhost:8000/health
```

atau buka [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI —
dokumentasi kontrak API lengkap & interaktif, selalu aktif).

## Alur Autentikasi

Ada **dua jalur terpisah**, jangan tertukar:

- **Gateway** (Raspberry Pi → backend): header `X-API-Key`, dipakai **hanya** untuk
  endpoint `/api/v1/ingest/*`.
- **User** (web/mobile → backend): `POST /api/v1/auth/register` →
  `POST /api/v1/auth/login` → simpan `access_token` → kirim sebagai header
  `Authorization: Bearer <token>` di semua endpoint lain.

## Alur Data dari Nol

Langkah yang harus dilakukan sebelum ada apa pun kelihatan di endpoint baca:

1. Register + login user.
2. `POST /api/v1/kolam` — buat kolam.
3. `POST /api/v1/kolam/{kolam_id}/devices/{device_code}` — klaim device ke kolam.
   Device seed yang tersedia: `master`, `SLV1`, `SLV2`, `SLV3`. Klaim
   `master` otomatis ikut mengklaim ketiga slave node di bawahnya.
4. Isi data sensor. Kalau belum ada hardware asli:
   ```bash
   python ml/scripts/synthetic_data_generator.py --backfill-hours 48
   ```
   (lihat catatan "file sementara" di header file itu sendiri — akan dihapus begitu
   data asli dari hardware tersedia).
5. Tunggu satu siklus scheduler otomatis (default tiap 60 menit, siklus pertama
   langsung jalan saat backend startup — cek `docker compose logs backend`), atau
   jalankan manual:
   ```bash
   python ml/scripts/test_e2e_classification.py
   python ml/scripts/forecast_anomaly_scan.py --device-code SLV1
   ```
6. Data sekarang bisa diambil lewat:
   - `GET /api/v1/readings` — data historis sensor
   - `GET /api/v1/quality/latest` — status ringkas kualitas air terkini
   - `GET /api/v1/quality/predictions` — seluruh forecast 1-6 jam ke depan (untuk grafik)
   - `GET /api/v1/kolam/{kolam_id}/devices` — topologi device dalam satu kolam (rak)

## Isolasi Data

User hanya bisa melihat device di kolam miliknya sendiri, kecuali role `admin`
(tidak dibatasi). Perilaku ini sudah diuji otomatis di
`backend/tests/test_kolam_isolation.py`.

## Yang Belum Ada

Supaya tim frontend tidak salah asumsi saat merencanakan UI:

- Fitur notifikasi (belum ada endpoint maupun tabel)
- Forgot password

## Referensi

[http://localhost:8000/docs](http://localhost:8000/docs) adalah kontrak API yang
selalu paling update — README ini cuma ringkasan alur, bukan pengganti Swagger.
