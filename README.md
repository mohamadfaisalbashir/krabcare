# KrabCare

Sistem monitoring kualitas air untuk budidaya kepiting sistem vertikal, dikembangkan
bekerja sama dengan Supermarket Kepiting Surabaya.

Repo ini berisi **stack web hosting saja**: database, API, frontend, dan reverse proxy.
Firmware (ESP32C3 slave + ESP32 master + Raspberry Pi gateway) berada di luar repo ini
dan berbicara ke backend lewat endpoint `/api/v1/ingest/*`.

## Tech Stack

- **Backend**: FastAPI + PostgreSQL/TimescaleDB
- **Web**: Next.js (standalone output)
- **Proxy**: Caddy (HTTPS otomatis via Let's Encrypt)
- **Edge computing**: fuzzy logic Mamdani (klasifikasi kualitas air) + WLR (forecast
  15/30/60 menit) + spesiasi NH3 (risiko amonia), dihitung LANGSUNG di Raspberry Pi
  gateway, kode-nya di `raspi/`. Backend cuma menerima hasil yang sudah jadi lewat
  `/api/v1/ingest/quality`, tidak menghitung apa pun sendiri.

## Setup Lokal

Asumsi Docker & Docker Compose sudah terinstall.

```bash
docker compose up --build -d
```

`.env` untuk development sudah ada di root (gitignored, tidak ikut `git clone`).
Untuk VPS, template-nya `env.production.example` — lihat bagian Deployment.

Cek backend hidup:

```bash
curl http://localhost:8000/health
```

atau buka [http://localhost:8000/docs](http://localhost:8000/docs) — Swagger UI, kontrak
API lengkap & interaktif, selalu aktif. README ini cuma ringkasan alur, bukan pengganti
Swagger.

**PENTING** — folder `database/init/*.sql` **hanya auto-jalan sekali**, saat volume
`pgdata` masih kosong (fresh clone). Kalau ada file SQL baru ditambahkan *setelah* volume
pernah dibuat, file itu **tidak otomatis jalan** — harus di-apply manual:

```bash
docker compose exec db psql -U krabcare -d krabcare_db \
  -f /docker-entrypoint-initdb.d/<nama_file>.sql
```

Kalau endpoint tiba-tiba error "relation does not exist" padahal kodenya sudah benar,
ini penyebabnya.

## Registrasi Device — baca sebelum menyalakan Raspberry Pi

**Backend tidak melakukan auto-register device.** Setiap `device_code` harus sudah ada di
tabel `devices` sebelum gateway mengirim data.

`database/init/04_seed_devices.sql` yang mengisinya. `device_code` = **MAC address
ESP32 tanpa pemisah, huruf besar** (`WiFi.macAddress()` lalu buang `:`) — pencocokannya
case-sensitive, jadi harus persis sama dengan yang dikirim firmware.
Kalau ada device baru, tambahkan barisnya di file itu, jangan hapus filenya.

Kalau `device_code` tidak dikenal, `POST /api/v1/ingest/readings` tetap membalas **201**
— reading-nya dibuang **diam-diam**. Jadi kalau data dari Raspi "tidak muncul di web",
cek dulu response ingest-nya:

```json
{ "received": 4, "inserted": 0, "unknown_device_codes": ["54D660E9BFB4"], "skipped_duplicates": [] }
```

`unknown_device_codes` terisi = device belum terdaftar. Cek isi tabelnya:

```bash
docker compose exec db psql -U krabcare -d krabcare_db \
  -c "SELECT device_code, device_type, rack_label FROM devices ORDER BY device_code;"
```

## Alur Autentikasi

Ada **dua jalur terpisah**, jangan tertukar:

- **Gateway** (Raspberry Pi → backend): header `X-API-Key`, dipakai **hanya** untuk
  endpoint `/api/v1/ingest/*`.
- **User** (web → backend): `POST /api/v1/auth/register` → `POST /api/v1/auth/login` →
  simpan `access_token` → kirim sebagai header `Authorization: Bearer <token>` di semua
  endpoint lain.

## Alur Data dari Nol

Langkah yang harus dilakukan sebelum ada apa pun kelihatan di web:

1. Register + login user.
2. `POST /api/v1/kolam` — buat kolam **sekaligus klaim device-nya**. Body-nya
   `{"nama": "...", "device_code": "..."}`; `device_code` **wajib**, karena
   **satu kolam = satu rak = TEPAT SATU device** (`kolam_service.py`). Keduanya
   satu transaksi: `device_code` tidak dikenal → 404 dan kolamnya **tidak jadi
   dibuat**, sudah dipakai kolam lain → 409. Tidak ada kolam yatim yang harus
   dibersihkan manual.
3. `POST /api/v1/kolam/{kolam_id}/devices/{device_code}` — masih ada, untuk
   MENGGANTI/menambahkan device pada kolam yang sudah terlanjur dibuat. Klaim
   device kedua ke kolam yang sama tetap ditolak 409, dan tidak ada cascade
   master → slave.
4. Nyalakan Raspberry Pi. Gateway POST ke `/api/v1/ingest/readings` (data mentah sensor)
   dan `/api/v1/ingest/quality` (hasil klasifikasi, forecast, risiko amonia yang sudah
   dihitung Raspi lewat `raspi/edge_pipeline.py`), keduanya pakai `X-API-Key` yang sama.
5. Data bisa diambil lewat:
   - `GET /api/v1/readings` — data historis sensor (ikut `received_at`, jam
     backend saat baris itu masuk; selisihnya terhadap `time` = latensi gateway,
     dan itulah kolom `latensi_detik` di ekspor CSV/XLSX)
   - `GET /api/v1/quality/latest` — status ringkas kualitas air terkini
   - `GET /api/v1/quality/predictions` — forecast 15/30/60 menit ke depan (untuk grafik)
   - `GET /api/v1/kolam/{kolam_id}/devices` — topologi device dalam satu kolam (rak)

## Isolasi Data

User hanya bisa melihat device di kolam miliknya sendiri, kecuali role `admin` (tidak
dibatasi).

## Ambang Parameter — dua salinan yang harus sinkron

Angka Tabel 2.1 ada di dua tempat karena Python dan TypeScript tidak bisa berbagi
konstanta:

- `backend/app/core/water_thresholds.py` — dipakai untuk memfilter log historis di SQL
- `web/src/lib/parameter.ts` — dipakai untuk mewarnai kartu & badge di UI

Ubah salah satu tanpa yang lain dan satu pembacaan bisa tampil "aman" di kartu tapi ikut
tersaring sebagai "bahaya" di log historis. Ubah keduanya bersamaan.

## Migrasi Skema Database (Alembic)

**Batas tanggung jawab — ini yang paling sering keliru:**

- `database/init/01..08_*.sql` = **BEKU**. Hanya untuk bootstrap database yang
  benar-benar kosong (volume `pgdata` baru). **Jangan pernah menambah file baru ke
  folder itu.**
- Semua perubahan skema **setelah** ini = **Alembic saja**.

Alembic mencatat revisi yang sudah dijalankan di tabel `alembic_version` di dalam
database itu sendiri, jadi `alembic upgrade head` tahu sendiri mana yang belum jalan.

```bash
docker compose exec backend alembic current                       # revisi sekarang
docker compose exec backend alembic revision -m "tambah kolom x"  # bikin revisi baru
docker compose exec backend alembic upgrade head                  # terapkan (dev)
./scripts/migrate.sh                                              # terapkan (VPS: backup dulu)
```

Baseline `445f8540edcb` sengaja **no-op** — skema sampai titik itu dibuat oleh
`database/init/*.sql`, bukan Alembic. Database yang sudah berisi data cukup di-*stamp*,
jangan di-*upgrade*:

```bash
docker compose exec backend alembic stamp head
```

### Aturan menulis migrasi yang aman untuk data asli

1. **Kolom baru wajib `nullable=True` atau punya `server_default`.** Menambah kolom
   `NOT NULL` tanpa default akan GAGAL di tabel yang sudah berisi data.
2. **Selalu tulis `downgrade()` yang benar**, jangan dibiarkan `pass` (kecuali revisi
   baseline yang memang no-op).
3. **Hindari operasi destruktif** (`DROP COLUMN`, `DROP TABLE`, ubah tipe kolom) pada
   tabel time-series yang sudah berisi data. Kalau memang perlu: buat kolom baru,
   migrasikan datanya, jangan menimpa.
4. **Uji dulu di salinan data produksi**: restore backup ke database lokal, jalankan
   `alembic upgrade head` di situ, baru terapkan ke VPS.

## Deployment ke VPS

### Prasyarat DNS

Domain (`DOMAIN` di `.env`) **harus sudah mengarah ke IP VPS sebelum Caddy dijalankan**,
dan port 80/443 terbuka. Kalau tidak, penerbitan sertifikat Let's Encrypt gagal dan HTTPS
tidak aktif.

### Perintah production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Menyebut `-f` eksplisit membuat `docker-compose.override.yml` (khusus dev, berisi bind
mount `./backend:/app`) **tidak ikut termuat** — jadi kode benar-benar berasal dari image
hasil build, bukan folder di host. Uvicorn juga jalan tanpa `--reload`.

Hanya Caddy yang terekspos ke internet (80/443). Backend dan database di-bind ke
`127.0.0.1` saja; Caddy menjangkau backend lewat jaringan internal Docker.

### Checklist deploy PERTAMA KALI (berurutan)

```bash
# 1. Siapkan .env — JANGAN pernah di-commit
cp env.production.example .env
openssl rand -base64 32   # ulangi untuk POSTGRES_PASSWORD, JWT_SECRET_KEY, GATEWAY_API_KEY
nano .env                 # isi juga DOMAIN & CORS_ORIGINS (format JSON!)

# 2. Jalankan
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 3. database/init/*.sql jalan OTOMATIS di boot pertama (volume pgdata masih kosong).
#    Cek tabelnya ada:      docker compose exec db psql -U krabcare -d krabcare_db -c '\dt'
#    Cek device ter-seed:   docker compose exec db psql -U krabcare -d krabcare_db -c 'SELECT device_code FROM devices;'
#    Harus keluar 54D660E9BFB4 — kalau kosong, gateway akan kirim data ke ruang hampa.

# 4. Tandai baseline Alembic — WAJIB, dan hanya sekali
docker compose exec backend alembic stamp head

# 5. Pasang cron backup harian
crontab -e
# 0 2 * * * cd /path/ke/crab && ./scripts/backup_db.sh >> backups/backup.log 2>&1
```

Kalau backend gagal start dengan pesan *"Konfigurasi production tidak aman"*, itu memang
disengaja: ada secret yang masih placeholder atau `DEBUG` masih `true`. Perbaiki `.env`,
jangan diakali.

### Alur update kode berikutnya

```bash
git pull
./scripts/migrate.sh    # backup dulu, baru alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Jangan pernah edit kode langsung di VPS.** Semua perubahan lewat git.

### ⚠️ PERINGATAN: jangan pernah `docker compose down -v` di VPS

Flag `-v` menghapus volume `pgdata` **beserta seluruh data sensor asli**. Data dari
Raspberry Pi tidak bisa diulang. Untuk menghentikan service, pakai `down` tanpa `-v`
(atau `stop`).
