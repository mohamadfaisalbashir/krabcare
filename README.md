# KrabCare

Sistem monitoring kualitas air untuk budidaya kepiting sistem vertikal, dikembangkan
bersama Supermarket Kepiting Surabaya.

Alurnya: ESP32 di tiap rak membaca pH, suhu, dan salinitas, Raspberry Pi gateway
menghitung klasifikasi, forecast, dan risiko amonia, lalu semuanya dikirim ke backend
di VPS. User memantaunya lewat web dan aplikasi Android, dan mendapat notifikasi saat
kondisi air memburuk.

## Isi Repo

| Folder | Isi | Dokumentasi |
|---|---|---|
| `backend/` | API FastAPI, model SQLAlchemy, migrasi Alembic | Swagger di `/docs` |
| `web/` | Dashboard Next.js (App Router, TypeScript, Tailwind) | `web/README.md` |
| `mobile/` | Aplikasi Android Flutter, fitur setara web | `mobile/README.md` |
| `raspi/` | Kode edge produksi: fuzzy, WLR, amonia, forwarder | `raspi/README.md` |
| `raspi-data/` | Salinan folder kerja di Raspberry Pi: baca UART, forwarder ke cloud, uji modul SIM7600, state forecaster | |
| `database/init/` | SQL bootstrap untuk database kosong | lihat bagian Migrasi |
| `scripts/` | `backup_db.sh`, `migrate.sh`, `api_latency.py` | |
| `postman/` | Koleksi uji latensi API | |

Firmware ESP32 tidak ada di repo ini. Firmware cuma bicara ke Raspberry Pi lewat UART;
yang mengirim ke backend adalah Raspi lewat endpoint `/api/v1/ingest/*`.

## Tech Stack

- **Backend**: FastAPI + PostgreSQL/TimescaleDB, migrasi Alembic
- **Web**: Next.js (standalone output)
- **Mobile**: Flutter (Android)
- **Proxy**: Caddy, HTTPS otomatis via Let's Encrypt untuk dua domain (API dan web)
- **Email**: SMTP, untuk verifikasi akun dan reset kata sandi
- **Push notification**: Firebase Cloud Messaging (opsional)
- **Edge computing**: fuzzy logic Mamdani (klasifikasi kualitas air), WLR (forecast
  15/30/60 menit), dan spesiasi NH3 (risiko amonia), semuanya dihitung di Raspberry Pi.
  Kodenya di `raspi/`. Backend cuma menerima hasil jadi lewat `/api/v1/ingest/quality`.

## Fitur

Web dan mobile memakai API yang sama:

- **Dashboard**: kartu per kolam berisi pH, suhu, salinitas, status kualitas air,
  prediksi 15/30/60 menit, risiko amonia, dan grafik. Urutan kartu bisa diatur dengan
  drag and drop.
- **Log Historis**: tabel per parameter dengan filter tanggal, interval, dan status,
  plus unduh data mentah ke CSV atau Excel (XLSX). Berkas unduhan ikut menyertakan
  `received_at` dan `latensi_detik` untuk mengukur lama pengiriman dari alat.
- **Notifikasi**: kualitas air memburuk, parameter keluar ambang, prediksi bahaya,
  sensor terindikasi error (lonjakan atau kosong), dan alat restart. Tersimpan di
  aplikasi, dan dikirim sebagai push kalau FCM aktif.
- **Perangkat** (khusus admin): daftar semua device, tambah device baru, pasang ke
  kolam, lepas, dan hapus.
- **Akun**: daftar dengan verifikasi email, login, lupa sandi, ubah profil, ganti
  sandi, hapus akun.

## Setup Lokal

Asumsi Docker & Docker Compose sudah terinstall.

```bash
docker compose up --build -d
```

Web di [http://localhost:3000](http://localhost:3000), backend di
[http://localhost:8000](http://localhost:8000).

`.env` untuk development sudah ada di root (gitignored, tidak ikut `git clone`).
Untuk VPS, template-nya `env.production.example`, lihat bagian Deployment.

Cek backend hidup:

```bash
curl http://localhost:8000/health
```

atau buka [http://localhost:8000/docs](http://localhost:8000/docs). Swagger UI di sana
adalah kontrak API lengkapnya; README ini cuma ringkasan alur.

`docker-compose.override.yml` ikut termuat otomatis di lokal. Isinya bind mount
`./backend:/app` (kode backend langsung terbaca tanpa rebuild) dan binding IPv6 supaya
`localhost` di Windows tidak ditolak. Web **tidak** di-bind mount, jadi setiap
perubahan di `web/` perlu rebuild:

```bash
docker compose up -d --build web
```

Kalau `SMTP_HOST` kosong, akun baru langsung dianggap terverifikasi (ada peringatan di
log backend), jadi pendaftaran tetap bisa dicoba tanpa server email.

## Registrasi Device: baca sebelum menyalakan Raspberry Pi

Backend tidak auto-register device. Setiap `device_code` harus sudah ada di tabel
`devices` sebelum gateway mengirim data.

`device_code` = MAC address ESP32 tanpa pemisah, huruf besar (`WiFi.macAddress()` lalu
buang `:`). Pencocokannya case-sensitive, jadi harus sama persis dengan yang dikirim
firmware. Ada dua cara mendaftarkannya:

- **Halaman Perangkat** di web (atau `POST /api/v1/devices`), khusus akun admin.
  Ini cara yang dipakai untuk device baru.
- `database/init/04_seed_devices.sql`, hanya jalan saat database masih kosong. Berisi
  device awal `54D660E9BFB4`. Jangan hapus filenya.

Untuk `device_code` yang tidak dikenal, `POST /api/v1/ingest/readings` tetap membalas
201 dan reading-nya dibuang tanpa error. Jadi kalau data dari Raspi tidak muncul di web,
cek dulu response ingest-nya:

```json
{ "received": 4, "inserted": 0, "unknown_device_codes": ["54D660E9BFB4"], "skipped_duplicates": [] }
```

`unknown_device_codes` terisi berarti device belum terdaftar. Cek isi tabelnya:

```bash
docker compose exec db psql -U krabcare -d krabcare_db \
  -c "SELECT device_code, device_type, rack_label FROM devices ORDER BY device_code;"
```

## Alur Autentikasi

Ada dua jalur terpisah:

- **Gateway** (Raspberry Pi → backend): header `X-API-Key` (`GATEWAY_API_KEY`), dipakai
  **hanya** untuk endpoint `/api/v1/ingest/*`.
- **User** (web/mobile → backend):
  1. `POST /auth/register`, backend mengirim link aktivasi ke email
     (`FRONTEND_VERIFY_EMAIL_URL`, berlaku `EMAIL_VERIFY_TOKEN_EXPIRE_MINUTES`).
  2. `POST /auth/verify-email` dari halaman `/verifikasi-email`. Link kedaluwarsa bisa
     diminta ulang lewat `POST /auth/resend-verification`.
  3. `POST /auth/login` → simpan `access_token` → kirim sebagai header
     `Authorization: Bearer <token>` di semua endpoint lain. Akun yang belum
     diverifikasi ditolak login.

  Lupa sandi: `POST /auth/forgot-password` → email berisi link ke `/reset-password` →
  `POST /auth/reset-password`. Endpoint auth dibatasi laju per IP.

Role user `operator` (default) atau `admin`. Tidak ada endpoint untuk menjadikan user
admin: akun admin awal dibuat dengan `python -m app.scripts.seed_admin` (lihat
checklist deploy), selebihnya ubah kolom `role` di tabel `users`.

## Alur Data dari Nol

Langkah yang harus dilakukan sebelum ada apa pun kelihatan di web:

1. Admin mendaftarkan `device_code` (lihat Registrasi Device).
2. User daftar, verifikasi email, lalu login.
3. `POST /api/v1/kolam`, buat kolam sekaligus klaim device-nya. Body-nya
   `{"nama": "...", "device_code": "..."}`. `device_code` wajib, karena satu kolam =
   satu rak = satu device. Keduanya satu transaksi: `device_code` tidak dikenal
   membalas 404 dan kolamnya tidak jadi dibuat, sudah dipakai kolam lain membalas 409.
4. `POST /api/v1/kolam/{kolam_id}/devices/{device_code}` untuk mengganti device pada
   kolam yang sudah dibuat. Klaim device kedua ke kolam yang sama ditolak 409. Admin
   juga bisa memasang atau melepas device lewat `POST /api/v1/devices/{id}/claim` dan
   `/unclaim`.
5. Nyalakan Raspberry Pi. Gateway mengirim ke:
   - `POST /api/v1/ingest/readings`, data mentah sensor
   - `POST /api/v1/ingest/quality`, hasil klasifikasi, forecast, dan risiko amonia yang
     sudah dihitung Raspi lewat `raspi/edge_pipeline.py`
   - `POST /api/v1/ingest/restart`, laporan ESP restart dari baris boot UART
6. Data bisa diambil lewat:
   - `GET /api/v1/readings`, data historis sensor (ikut `received_at`, jam backend saat
     baris itu masuk; selisihnya terhadap `time` = latensi gateway)
   - `GET /api/v1/readings/sensor-status`, sensor yang terindikasi error
   - `GET /api/v1/quality/latest`, status ringkas kualitas air terkini
   - `GET /api/v1/quality/predictions`, forecast 15/30/60 menit ke depan
   - `GET /api/v1/quality/ammonia-risk` dan `/ammonia-risk/history`, risiko amonia
     terkini dan riwayatnya
   - `GET /api/v1/notifications`, notifikasi user
   - `GET /api/v1/kolam/{kolam_id}/devices`, topologi device dalam satu kolam

Data mentah yang ditampilkan dan diunduh dibatasi 1000 baris per permintaan; web
mengambilnya bertahap (lihat `fetchAllReadings` di `web/src/lib/export.ts`).

## Isolasi Data

User hanya bisa melihat device di kolam miliknya sendiri, kecuali role `admin` (tidak
dibatasi).

## Ambang Parameter: tiga salinan yang harus sinkron

Angka Tabel 2.1 ada di tiga tempat karena Python, TypeScript, dan Dart tidak bisa berbagi
konstanta:

- `backend/app/core/water_thresholds.py`, dipakai untuk memfilter log historis di SQL
- `web/src/lib/parameter.ts`, dipakai untuk mewarnai kartu & badge di UI
- `mobile/lib/logic.dart`, padanan `parameter.ts` di aplikasi Android

Kalau cuma salah satu yang diubah, satu pembacaan bisa tampil "aman" di kartu tapi
tersaring sebagai "bahaya" di log historis. Ubah ketiganya bersamaan.

## Migrasi Skema Database (Alembic)

Batas tanggung jawabnya:

- `database/init/01..08_*.sql` beku, hanya untuk bootstrap database kosong (volume
  `pgdata` baru) dan hanya auto-jalan sekali. Jangan menambah file baru ke folder itu.
- Semua perubahan skema setelah itu lewat Alembic (`backend/alembic/versions/`).

Alembic mencatat revisi yang sudah dijalankan di tabel `alembic_version` di dalam
database itu sendiri, jadi `alembic upgrade head` tahu sendiri mana yang belum jalan.

**Container backend menjalankan `alembic upgrade head` sendiri setiap start**
(`backend/entrypoint.sh`). Kalau migrasinya gagal, backend tidak naik dan terus
restart; lihat penyebabnya di `docker compose logs backend`.

```bash
docker compose exec backend alembic current                       # revisi sekarang
docker compose exec backend alembic revision -m "tambah kolom x"  # bikin revisi baru
docker compose exec backend alembic upgrade head                  # terapkan manual
./scripts/migrate.sh                                              # terapkan (VPS: backup dulu)
```

Baseline `445f8540edcb` no-op: skema sampai titik itu dibuat `database/init/*.sql`.

**Masalah yang diketahui pada database baru:** `08_notifications.sql` sudah berisi
kolom `notifications.parameter`, padahal migrasi `d4e1f8a2b3c4` juga menambahkannya,
sehingga `upgrade head` dari database kosong gagal dengan `DuplicateColumn`. Sampai
diperbaiki, hapus dulu kolom itu sebelum backend pertama kali start, lalu semua
migrasi berjalan normal:

```bash
docker compose up -d db
docker compose exec db psql -U krabcare -d krabcare_db \
  -c "ALTER TABLE notifications DROP COLUMN parameter;"
docker compose up -d
```

Error "relation does not exist" atau "column does not exist" padahal kodenya benar
biasanya berarti migrasi belum dijalankan.

Di Windows dengan `core.autocrlf=true`, backend lokal bisa restart terus dengan pesan
`exec ./entrypoint.sh: no such file or directory`. Penyebabnya akhir baris CRLF di
`entrypoint.sh` yang terbaca lewat bind mount; ubah berkas itu ke LF.

### Aturan menulis migrasi yang aman untuk data asli

1. **Kolom baru wajib `nullable=True` atau punya `server_default`.** Kolom `NOT NULL`
   tanpa default akan gagal di tabel yang sudah berisi data.
2. **Selalu tulis `downgrade()` yang benar**, jangan dibiarkan `pass`, kecuali revisi
   baseline yang memang no-op.
3. **Hindari operasi destruktif** (`DROP COLUMN`, `DROP TABLE`, ubah tipe kolom) pada
   tabel time-series yang sudah berisi data. Kalau perlu, buat kolom baru lalu
   migrasikan datanya.
4. **Uji dulu di salinan data produksi**: restore backup ke database lokal, jalankan
   `alembic upgrade head` di situ, baru terapkan ke VPS.

## Deployment ke VPS

### Prasyarat DNS

Dua domain harus sudah mengarah ke IP VPS sebelum Caddy dijalankan, dan port 80/443
terbuka. Kalau tidak, penerbitan sertifikat Let's Encrypt gagal.

- `DOMAIN` (mis. `api.krabcare.com`) → backend
- `WEB_DOMAIN` (mis. `krabcare.com`) → web

### Perintah production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Menyebut `-f` eksplisit membuat `docker-compose.override.yml` (khusus dev) tidak ikut
termuat, jadi kodenya berasal dari image hasil build, bukan folder di host. Uvicorn
juga jalan tanpa `--reload`.

Hanya Caddy yang terekspos ke internet (80/443). Backend, web, dan database di-bind ke
`127.0.0.1` saja. Caddy menjangkau keduanya lewat jaringan internal Docker dan
menambahkan header keamanan (HSTS, CSP, dan lainnya).

`NEXT_PUBLIC_API_BASE_URL` di-inline ke bundel web saat build, jadi perubahannya baru
berlaku setelah image web dibangun ulang.

### Checklist deploy pertama kali (berurutan)

```bash
# 1. Siapkan .env, jangan di-commit
cp env.production.example .env
openssl rand -base64 32   # ulangi untuk POSTGRES_PASSWORD, JWT_SECRET_KEY, GATEWAY_API_KEY
nano .env                 # isi DOMAIN, WEB_DOMAIN, NEXT_PUBLIC_API_BASE_URL,
                          # CORS_ORIGINS (format JSON), dan SMTP_*

# 2. (Opsional) push notification: unggah service account Firebase
mkdir -p secrets && cp firebase.json secrets/
# lalu di .env: FIREBASE_CREDENTIALS_PATH=/run/secrets/firebase.json

# 3. Nyalakan database dulu. database/init/*.sql jalan otomatis di boot pertama.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db
#    Lalu terapkan perbaikan DuplicateColumn (lihat bagian Migrasi):
docker compose exec db psql -U krabcare -d krabcare_db \
  -c "ALTER TABLE notifications DROP COLUMN parameter;"

# 4. Jalankan semuanya. Backend menjalankan alembic upgrade head sendiri.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
#    Cek revisi:            docker compose exec backend alembic current
#    Cek device ter-seed:   docker compose exec db psql -U krabcare -d krabcare_db -c 'SELECT device_code FROM devices;'

# 5. Buat akun admin awal (idempoten). Email dan sandi awalnya ada di
#    backend/app/scripts/seed_admin.py; segera ganti sandinya setelah login.
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec backend python -m app.scripts.seed_admin
#    Script ini belum mengisi email_verified_at, jadi login ditolak 403 sampai:
docker compose exec db psql -U krabcare -d krabcare_db \
  -c "UPDATE users SET email_verified_at = now() WHERE role = 'admin' AND email_verified_at IS NULL;"

# 6. Pasang cron backup harian (menyimpan 14 hari terakhir di backups/)
crontab -e
# 0 2 * * * cd /path/ke/repo && ./scripts/backup_db.sh >> backups/backup.log 2>&1
```

Backend yang gagal start dengan pesan *"Konfigurasi production tidak aman"* berarti ada
secret yang masih placeholder atau `DEBUG` masih `true`. Perbaiki `.env`.

`FRONTEND_VERIFY_EMAIL_URL` dan `FRONTEND_RESET_PASSWORD_URL` harus alamat publik, bukan
localhost, karena link-nya dibuka dari HP atau komputer penerima email.

### Alur update kode berikutnya

```bash
git pull
./scripts/backup_db.sh  # backup dulu: migrasi baru ikut jalan saat backend start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Kalau yang berubah hanya `web/`, cukup bangun ulang service web:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build web
```

Jangan edit kode langsung di VPS, semua perubahan lewat git.

### Jangan jalankan `docker compose down -v` di VPS

Flag `-v` menghapus volume `pgdata` beserta seluruh data sensor asli, dan data dari
Raspberry Pi tidak bisa diulang. Untuk menghentikan service pakai `down` tanpa `-v`,
atau `stop`.
