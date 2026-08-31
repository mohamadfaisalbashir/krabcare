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
   python ml/scripts/dummy_readings.py --backfill-hours 48
   ```
   (lihat catatan "file sementara" di header file itu sendiri — akan dihapus begitu
   data asli dari hardware tersedia).
5. Tunggu satu siklus scheduler otomatis (default tiap 60 menit, siklus pertama
   langsung jalan saat backend startup — cek `docker compose logs backend`), atau
   jalankan manual:
   ```bash
   python ml/scripts/run_classification.py
   python ml/scripts/scan_anomaly.py --device-code SLV1
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

## Referensi

[http://localhost:8000/docs](http://localhost:8000/docs) adalah kontrak API yang
selalu paling update — README ini cuma ringkasan alur, bukan pengganti Swagger.

## Migrasi Skema Database (Alembic)

**Batas tanggung jawab — ini yang paling sering keliru:**

- `database/init/01..08_*.sql` = **BEKU**. Hanya untuk bootstrap database yang
  benar-benar kosong (volume `pgdata` baru). **Jangan pernah menambah file `09_`
  ke folder itu lagi.**
- Semua perubahan skema **setelah** ini = **Alembic saja**.

Alembic mencatat revisi yang sudah dijalankan di tabel `alembic_version` di dalam
database itu sendiri, jadi `alembic upgrade head` tahu sendiri mana yang belum
jalan — tidak ada lagi tebak-tebakan "file SQL mana yang sudah di-apply di server
mana".

```bash
docker compose exec backend alembic current                    # revisi sekarang
docker compose exec backend alembic revision -m "tambah kolom x"  # bikin revisi baru
docker compose exec backend alembic upgrade head               # terapkan (dev)
./scripts/migrate.sh                                           # terapkan (VPS: backup dulu)
```

Baseline `445f8540edcb` sengaja **no-op** — skema sampai titik itu dibuat oleh
`database/init/*.sql`, bukan Alembic. Database yang sudah berisi data cukup
di-*stamp*, jangan di-*upgrade*:

```bash
docker compose exec backend alembic stamp head
```

### Aturan menulis migrasi yang aman untuk data asli

1. **Kolom baru wajib `nullable=True` atau punya `server_default`.** Menambah
   kolom `NOT NULL` tanpa default akan GAGAL di tabel yang sudah berisi data.
2. **Selalu tulis `downgrade()` yang benar**, jangan dibiarkan `pass` (kecuali
   revisi baseline yang memang no-op).
3. **Hindari operasi destruktif** (`DROP COLUMN`, `DROP TABLE`, ubah tipe kolom)
   pada tabel time-series yang sudah berisi data. Kalau memang perlu: buat kolom
   baru, migrasikan datanya, jangan menimpa.
4. **Uji dulu di salinan data produksi**: restore backup ke database lokal,
   jalankan `alembic upgrade head` di situ, baru terapkan ke VPS.

## Deployment ke VPS

### Prasyarat DNS

Domain (`DOMAIN` di `.env`) **harus sudah mengarah ke IP VPS sebelum Caddy
dijalankan**, dan port 80/443 terbuka. Kalau tidak, penerbitan sertifikat
Let's Encrypt gagal dan HTTPS tidak aktif.

### Perintah production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Menyebut `-f` eksplisit membuat `docker-compose.override.yml` (khusus dev, berisi
bind mount `./backend:/app`) **tidak ikut termuat** — jadi kode benar-benar berasal
dari image hasil build, bukan folder di host. Uvicorn juga jalan tanpa `--reload`.

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
#    Cek: docker compose exec db psql -U sismon_kepiting -d sismon_kepiting_db -c '\dt'

# 4. Tandai baseline Alembic — WAJIB, dan hanya sekali
docker compose exec backend alembic stamp head

# 5. Pasang cron backup harian
crontab -e
# 0 2 * * * cd /path/ke/crab && ./scripts/backup_db.sh >> backups/backup.log 2>&1
```

Kalau backend gagal start dengan pesan *"Konfigurasi production tidak aman"*, itu
memang disengaja: ada secret yang masih placeholder atau `DEBUG` masih `true`.
Perbaiki `.env`, jangan diakali.

### Alur update kode berikutnya

```bash
git pull
./scripts/migrate.sh    # backup dulu, baru alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Jangan pernah edit kode langsung di VPS.** Semua perubahan lewat git.

### ⚠️ PERINGATAN: jangan pernah `docker compose down -v` di VPS

Flag `-v` menghapus volume `pgdata` **beserta seluruh data sensor asli**. Data dari
Raspberry Pi tidak bisa diulang. Untuk menghentikan service, pakai `down` tanpa
`-v` (atau `stop`).
