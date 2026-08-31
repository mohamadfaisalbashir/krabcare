Tempel ke Claude Code di root folder crab/. Tugasnya: menyiapkan backend + database
supaya aman dan benar saat di-deploy ke VPS yang berisi data sensor asli. JANGAN
mengubah perilaku development yang sudah jalan — semua perubahan harus tetap membuat
`docker compose up --build -d` lokal berfungsi persis seperti sekarang.

Baca CLAUDE.md dulu sebelum mulai.

=====================================================================
BAGIAN A — PERBAIKAN DI FILE YANG SUDAH ADA (aman untuk dev & prod)
=====================================================================

A1. docker-compose.yml — batasi publikasi port ke localhost saja.

Service `db`:
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"

Service `backend`:
    ports:
      - "127.0.0.1:8000:8000"

Alasannya: di laptop tidak ada bedanya (akses localhost tetap jalan, pytest dari
host tetap bisa konek ke DB), tapi di VPS ini yang mencegah database dan API
terekspos langsung ke internet. Caddy nanti jadi satu-satunya pintu masuk dari
luar, dan dia menjangkau backend lewat jaringan internal Docker.

PENTING: perubahan ini WAJIB di file base, bukan override, karena Docker Compose
TIDAK BISA menghapus entri `ports` lewat override — list `ports` digabung.

A2. docker-compose.yml — tambahkan CORS_ORIGINS dan PROJECT_NAME ke daftar
`environment:` service backend (saat ini CORS_ORIGINS tidak diteruskan sama sekali,
sehingga di VPS selalu memakai default localhost:3000):

      PROJECT_NAME: ${PROJECT_NAME:-sismon_kepiting API}
      CORS_ORIGINS: ${CORS_ORIGINS:-["http://localhost:3000"]}

CATATAN: CORS_ORIGINS bertipe list[str] di pydantic-settings, jadi nilainya harus
format JSON (kurung siku, tanda kutip ganda), bukan dipisah koma. Ini jebakan
klasik — dokumentasikan jelas di file .env contoh.

A3. docker-compose.yml — rotasi log di KEDUA service (db dan backend), supaya
disk VPS tidak penuh oleh log Docker yang tumbuh tanpa batas:

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

A4. docker-compose.yml — healthcheck untuk service backend (endpoint /health
sudah ada tapi belum dipakai compose):

    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/health')\""]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

Pakai python, JANGAN curl/wget — image python:3.12-slim tidak punya keduanya.
Verifikasi statusnya benar-benar jadi "healthy", jangan diasumsikan.

A5. backend/app/core/config.py — fail-fast kalau dijalankan sebagai production
dengan secret yang masih placeholder. Ini pengaman utama supaya tidak pernah ada
deployment yang diam-diam jalan dengan password publik.

Tambahkan model_validator (mode="after") ke class Settings:

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self
        weak = {"ai-dilarangbaca", "change-me", "change-me-too", ""}
        problems = []
        if self.JWT_SECRET_KEY in weak:
            problems.append("JWT_SECRET_KEY")
        if self.GATEWAY_API_KEY in weak:
            problems.append("GATEWAY_API_KEY")
        if self.POSTGRES_PASSWORD in weak:
            problems.append("POSTGRES_PASSWORD")
        if self.DEBUG:
            problems.append("DEBUG harus false di production")
        if problems:
            raise ValueError(
                "Konfigurasi production tidak aman — masih memakai nilai placeholder "
                f"atau setelan development: {', '.join(problems)}"
            )
        return self

Import model_validator dari pydantic. Pastikan TIDAK mengganggu dev
(ENVIRONMENT=development), buktikan dengan menjalankan pytest.

=====================================================================
BAGIAN B — FILE BARU KHUSUS PRODUCTION
=====================================================================

B1. docker-compose.prod.yml (override, dipakai bersama file base).

Isinya HANYA yang berbeda dari dev:
- backend: ENVIRONMENT: production, DEBUG: "false"
- backend: command menimpa CMD Dockerfile supaya TANPA --reload:
      command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
- backend: hilangkan bind mount ./backend:/app supaya kode benar-benar berasal
  dari image hasil build, bukan folder host.

  PENTING: cek dulu apakah override BISA menimpa entri volumes berdasarkan target
  path. Jangan diasumsikan — buktikan dengan:
      docker compose -f docker-compose.yml -f docker-compose.prod.yml config
  dan baca hasil render-nya. Kalau volumes ternyata digabung (bind mount masih
  ada), jangan dipaksakan lewat override — pindahkan bind mount itu ke
  docker-compose.override.yml khusus dev (Compose otomatis memuat file bernama
  itu saat dev, dan tidak ikut terpakai saat kita menyebut -f eksplisit untuk prod).

  CATATAN: bind mount ./ml:/app/ml:ro HARUS TETAP ADA di prod. Build context
  Dockerfile adalah ./backend, jadi folder ml/ tidak ikut ter-COPY ke image —
  kalau mount ini dihapus, `import ml.fuzzy` gagal dan seluruh scheduler mati.
  Ini keputusan sadar, jangan "dirapikan".

- service caddy (baru) untuk HTTPS otomatis:
      caddy:
        image: caddy:2-alpine
        container_name: sismon_kepiting-caddy
        restart: unless-stopped
        ports:
          - "80:80"
          - "443:443"
        volumes:
          - ./Caddyfile:/etc/caddy/Caddyfile:ro
          - caddy_data:/data
          - caddy_config:/config
        depends_on:
          - backend
        logging: (sama seperti service lain)
  Tambahkan volumes caddy_data & caddy_config di bagian volumes.

B2. Caddyfile (root project):

{$DOMAIN} {
    reverse_proxy backend:8000
}

Caddy mengurus sertifikat Let's Encrypt otomatis asal domain sudah mengarah ke IP
VPS dan port 80/443 terbuka. Jelaskan prasyarat ini di README.

B3. env.production.example (PERHATIKAN: tanpa titik di depan).

Alasannya konkret: .gitignore saat ini punya baris `.env.*` dengan pengecualian
hanya `!.env.example`, sehingga file bernama `.env.production.example` akan IKUT
TERABAIKAN git dan tidak pernah ter-commit. Dua pilihan — pakai nama
`env.production.example` seperti di atas, ATAU tambahkan
`!.env.production.example` ke .gitignore. Pilih salah satu, jangan biarkan file
contoh production hilang diam-diam.

Isinya: semua variabel dari .env.example tapi dengan
- ENVIRONMENT=production
- DEBUG=false
- POSTGRES_PASSWORD, JWT_SECRET_KEY, GATEWAY_API_KEY dikosongkan, dengan komentar
  cara membuat nilai acak: openssl rand -base64 32
- CORS_ORIGINS=["https://domain-web-anda.com"]  (catat format JSON-nya)
- FRONTEND_RESET_PASSWORD_URL=https://domain-web-anda.com/reset-password
- DOMAIN=api.domain-anda.com   (dipakai Caddyfile)

=====================================================================
BAGIAN C — ALEMBIC (menutup kelemahan migrasi manual)
=====================================================================

Masalah yang diselesaikan: file database/init/*.sql hanya auto-jalan sekali saat
volume pgdata masih kosong. Di VPS yang sudah berisi data sensor asli, volume itu
TIDAK BOLEH dikosongkan, sehingga setiap file SQL baru harus di-apply manual — dan
tidak ada catatan apa pun tentang file mana yang sudah pernah dijalankan di server
mana. Alembic menyimpan catatan itu di dalam database (tabel alembic_version),
sehingga `alembic upgrade head` tahu sendiri migrasi mana yang belum jalan.

Dependency sudah tersedia: alembic==1.14.0 dan psycopg2-binary sudah ada di
requirements.txt, dan config.py sudah punya property DATABASE_URL_SYNC (driver
psycopg2) yang memang disiapkan untuk Alembic. Pakai Alembic mode SINKRON —
jangan pakai template async, tidak ada alasan menambah kerumitan itu di sini.

C1. Jalankan `alembic init alembic` DARI DALAM folder backend/, sehingga hasilnya
backend/alembic/ dan backend/alembic.ini. Ini penting supaya `app` bisa di-import
oleh env.py, dan supaya file alembic ikut masuk image lewat `COPY . .` di
Dockerfile.

C2. backend/alembic.ini — kosongkan sqlalchemy.url (biarkan diisi dari env.py),
JANGAN menulis kredensial database di file ini karena ikut ter-commit ke git.

C3. backend/alembic/env.py — ubah supaya:
- URL diambil dari aplikasi, bukan dari alembic.ini:
      from app.core.config import settings
      config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)
- target_metadata diisi metadata milik aplikasi, dan SEMUA model di-import supaya
  metadata-nya terisi lengkap:
      from app.db.base import Base
      import app.models  # noqa: F401 — wajib, supaya semua tabel terdaftar
      target_metadata = Base.metadata
- JANGAN meng-import app.main di sini. app.main memicu scheduler dan meng-import
  ml.fuzzy secara transitif — tidak dibutuhkan untuk migrasi dan bisa bikin gagal.

C4. Baseline revision. Ini bagian paling kritis, kerjakan persis:

Database yang ada sekarang (baik dev maupun nanti VPS) skemanya dibuat oleh
database/init/01..08. Jadi baseline Alembic harus merepresentasikan "skema
sebagaimana adanya setelah file 08", BUKAN mencoba membuat ulang semuanya.

- Buat satu revisi kosong (no-op): `alembic revision -m "baseline skema init 01-08"`
  dengan upgrade() dan downgrade() berisi `pass`, plus docstring yang menjelaskan
  bahwa skema sampai titik ini dibuat oleh database/init/*.sql, bukan oleh Alembic.
- Untuk database yang SUDAH ADA, tandai sudah berada di revisi itu tanpa
  menjalankan apa pun:
      docker compose exec backend alembic stamp head
  Jalankan ini pada DB dev sekarang, dan dokumentasikan sebagai langkah wajib
  saat pertama kali deploy ke VPS (setelah init SQL jalan di boot pertama).

C5. Batas tanggung jawab yang harus ditulis eksplisit di dokumentasi:
- database/init/01..08 = BEKU. Hanya untuk bootstrap database yang benar-benar
  kosong. JANGAN pernah menambah file 09 ke folder itu lagi.
- Semua perubahan skema SETELAH ini = Alembic saja.

C6. Verifikasi drift model vs skema — ini bonus penting dari Alembic. Setelah
stamp, jalankan:
      docker compose exec backend alembic revision --autogenerate -m "cek drift"
Hasilnya IDEALNYA kosong (tidak ada operasi). Kalau ternyata TIDAK kosong, itu
berarti model SQLAlchemy dan skema SQL sudah melenceng satu sama lain — laporkan
temuannya ke saya secara rinci, JANGAN langsung diterapkan. Setelah diperiksa,
hapus file revisi percobaan ini.

Catatan: kalau autogenerate menghasilkan operasi aneh terkait objek internal
TimescaleDB (skema _timescaledb_*), tambahkan fungsi include_object di env.py
untuk mengabaikannya. Periksa dulu hasil nyatanya sebelum menambah filter —
jangan menambah kode untuk masalah yang belum terbukti ada.

=====================================================================
BAGIAN D — PENGAMAN DATA PRODUKSI
=====================================================================

D1. scripts/backup_db.sh — backup pg_dump.

Isi: pg_dump lewat `docker compose exec -T db pg_dump`, simpan ke folder backups/
dengan nama bertanggal, hapus backup lebih tua dari 14 hari. Beri komentar cara
memasangnya ke cron harian di VPS. Tambahkan backups/ ke .gitignore.

Alasan ini bukan opsional: data sensor dari Raspberry Pi tidak bisa diulang
kalau hilang.

D2. scripts/migrate.sh — pembungkus migrasi yang aman untuk produksi.

Urutannya WAJIB: jalankan backup_db.sh dulu, baru `alembic upgrade head`. Kalau
backup gagal, HENTIKAN — jangan lanjut migrasi (pakai `set -e`). Tampilkan
`alembic current` sebelum dan sesudah supaya jelas revisi mana yang diterapkan.

D3. Aturan penulisan migrasi yang harus ditulis di dokumentasi, karena ini yang
membedakan migrasi aman dan migrasi yang merusak data asli:
- Kolom baru harus nullable atau punya server_default. Menambah kolom NOT NULL
  tanpa default akan gagal di tabel yang sudah berisi data.
- Selalu tulis downgrade() yang benar, jangan dibiarkan `pass`.
- Hindari operasi destruktif (DROP COLUMN, DROP TABLE, ubah tipe kolom) pada tabel
  time-series yang sudah berisi data. Kalau memang perlu, buat kolom baru dan
  migrasikan datanya, jangan menimpa.
- Uji migrasi dulu pada salinan data produksi: restore backup ke database lokal,
  jalankan `alembic upgrade head` di situ, baru terapkan ke VPS.

D4. Keputusan seed data — LAPORKAN, jangan diubah sendiri.

database/init/04_seed_dev_devices.sql menyisipkan device master, SLV1, SLV2, SLV3
saat boot pertama. Di VPS produksi ini akan ikut jalan. Periksa dan laporkan ke
saya: apakah device_code tersebut memang kode yang akan dipakai firmware asli?
Kalau ya, seed ini justru berguna dan biarkan. Kalau tidak, seed ini akan membuat
device hantu yang tidak pernah mengirim data. Ini keputusan yang perlu
dikonfirmasi ke tim firmware, jadi cukup laporkan temuannya — jangan mengubah
file itu tanpa persetujuan.

=====================================================================
BAGIAN E — DOKUMENTASI
=====================================================================

E1. README.md — bagian "Deployment ke VPS":
- Perintah production:
      docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
- Cara membuat .env di VPS dari env.production.example, dan penegasan bahwa .env
  TIDAK PERNAH di-commit.
- Prasyarat DNS: domain harus sudah mengarah ke IP VPS SEBELUM Caddy dijalankan,
  kalau tidak penerbitan sertifikat gagal.
- Checklist deploy PERTAMA KALI, berurutan: siapkan .env -> up -d --build ->
  init SQL jalan otomatis di boot pertama -> `alembic stamp head` -> pasang cron
  backup harian.
- Alur update kode berikutnya: git pull -> ./scripts/migrate.sh -> up -d --build.
  Tegaskan: jangan pernah edit kode langsung di VPS.
- PERINGATAN eksplisit: di VPS JANGAN pernah menjalankan `docker compose down -v`
  — flag -v menghapus volume pgdata beserta seluruh data sensor asli.

E2. CLAUDE.md — perbarui bagian yang relevan:
- Keberadaan docker-compose.prod.yml dan aturan "jangan down -v di VPS".
- GOTCHA migrasi: perbarui menjadi "database/init/01-08 beku, hanya untuk DB
  kosong; semua perubahan skema baru lewat Alembic".
- Bagian status: Alembic sudah tidak lagi "belum dikerjakan".

=====================================================================
VERIFIKASI — jalankan dan laporkan hasil tiap langkah, jangan diasumsikan
=====================================================================

1. `docker compose up --build -d` (dev, tanpa file prod) — pastikan tetap jalan
   persis seperti sebelumnya, tidak ada regresi.
2. `curl http://localhost:8000/health` — masih 200.
3. `docker compose ps` — service backend berstatus healthy (bukan cuma running).
4. `cd backend && pytest` — semua test lulus, membuktikan validator A5 tidak
   mengganggu dev.
5. `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` —
   tampilkan hasil render dan periksa eksplisit: --reload sudah hilang, bind mount
   ./backend:/app sudah tidak ada, ./ml:/app/ml:ro masih ada, ENVIRONMENT
   production, DEBUG false. Laporkan apa adanya.
6. Uji fail-fast A5: jalankan container backend dengan ENVIRONMENT=production tapi
   JWT_SECRET_KEY masih ai-dilarangbaca — HARUS gagal start dengan pesan jelas.
   Ini pengujian paling penting di daftar ini, jangan dilewat.
7. `docker compose exec backend alembic current` — tampilkan hasilnya, pastikan
   DB dev sudah ter-stamp di baseline.
8. `docker compose exec backend alembic revision --autogenerate -m "cek drift"` —
   laporkan isi file yang dihasilkan. Kosong = model dan skema sinkron. Tidak
   kosong = laporkan rinci, jangan diterapkan. Hapus file percobaan ini setelahnya.
9. Uji siklus migrasi sungguhan: buat satu migrasi percobaan yang menambah kolom
   nullable ke tabel kecil (mis. kolam), jalankan `alembic upgrade head`,
   pastikan kolom muncul di DB, lalu `alembic downgrade -1` dan pastikan kolom
   hilang. Setelah terbukti dua arah berfungsi, hapus file migrasi percobaan itu
   dan pastikan DB kembali ke baseline. Ini membuktikan Alembic benar-benar
   berfungsi, bukan sekadar ter-install.
10. `bash scripts/backup_db.sh` — pastikan file backup benar-benar terbentuk dan
    ukurannya wajar (bukan 0 byte).
11. `git status` — pastikan tidak ada file .env asli atau isi backups/ yang
    tidak sengaja ter-stage.

Laporkan hasil tiap langkah termasuk yang gagal. Jangan lanjut ke langkah
berikutnya kalau langkah sebelumnya belum jelas hasilnya.