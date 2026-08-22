# CLAUDE.md — sismon_kepiting

Konteks proyek buat Claude Code yang kerja di repo ini. Baca file ini dulu sebelum mulai — jangan tebak ulang keputusan yang sudah dibuat. JANGAN MELAKUKAN COMIT GIT TANPA PERSETUJUAN

## Tentang proyek

Sistem monitoring kualitas air IoT untuk budidaya kepiting (Scylla serrata) sistem vertikal (rak bertingkat), kerja sama dengan Supermarket Kepiting Surabaya. Tugas akhir (TA) mahasiswa Teknik Komputer. Bagian yang dikerjakan lewat repo ini: ML (fuzzy logic & fuzzy time series), backend, web, mobile. Firmware (ESP32C3/ESP32/Raspberry Pi) dikerjakan anggota tim lain, di luar repo/scope ini kecuali sebagai konsumen API.

**Fase saat ini: coding & debugging, BUKAN desain.** Desain sudah final (lihat `docs/CD GAB...pdf`). Jangan usulkan perubahan arsitektur besar tanpa diminta — fokus implementasi & perbaikan bug dari desain yang sudah matang. Timeline TA: integrasi hardware+software ditargetkan berjalan sekitar September — kalau kerjaan menyentuh kontrak API yang dipakai firmware/gateway, ingat itu tidak jauh lagi.

## Tech stack — TETAP, jangan disarankan ganti

- **Firmware**: ESP32C3 (slave node per level) + ESP32 (master node) + Raspberry Pi (gateway + GSM) — di luar repo ini kecuali sebagai konsumen `/api/v1/ingest/*`
- **Backend**: FastAPI (async) + PostgreSQL/TimescaleDB, SQLAlchemy 2.0 async (asyncpg)
- **Web**: Next.js
- **Mobile**: Flutter
- **ML**: fuzzy logic Mamdani (klasifikasi real-time) + fuzzy time series metode Chen (prediksi jangka pendek) — **non-parametrik, tidak ada training/model artifact tersimpan.** Jangan sarankan pendekatan ML berbasis training (scikit-learn, dsb.) untuk modul ini — itu justru menyalahi requirement tesis (FR-08: membership function tetap/tidak dikonfigurasi user).

## Struktur repo

```
backend/app/
  core/       config, security (JWT + gateway API key + DataAccessScope), email, push
  models/     SQLAlchemy ORM
  schemas/    Pydantic *In/*Out
  routers/    endpoint FastAPI, TIPIS — logic ada di services/
  services/   business logic, dipanggil router & scheduler
database/init/   SQL bernomor urut, lihat GOTCHA di bawah
ml/fuzzy/        Mamdani + FTS Chen + agregasi bucket waktu — murni stdlib, no dependency
ml/scripts/      script manual (test end-to-end, backtest, generator data sintetis) — standalone, urllib
web/, mobile/, firmware/   belum di-scaffold (masih .gitkeep)
docs/            dokumen desain tesis (PDF)
```

## Keputusan arsitektur yang sudah dibuat — ikuti pola ini, jangan reinvent

**Dua jalur auth terpisah** (`app/core/security.py`, dependency `get_data_access_scope`): gateway pakai header `X-API-Key` (akses penuh, tidak dibatasi kolam), user pakai JWT Bearer (dibatasi ke device di kolam miliknya lewat `allowed_device_ids`, kecuali role `admin`). Endpoint baca data selalu pakai `DataAccessScope`, bukan `get_current_user` biasa — kecuali endpoint yang memang cuma boleh diakses user (kolam, notifications, auth/me).

**Isolasi data berbasis kepemilikan kolam**: `kolam.owner_user_id` → `devices.kolam_id`. User A tidak bisa lihat device/kolam milik user B. `get_owned_kolam()` sengaja return `None` seragam baik kolam tidak ada maupun ada-tapi-bukan-punya-user-ini (404 seragam, anti-enumeration). Diuji di `backend/tests/test_kolam_isolation.py` — kalau ubah apa pun di area ini, jalankan test ini.

**Insert selalu idempoten**: pola `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`, lalu laporkan `skipped_duplicates` eksplisit ke caller (lihat `ingest_service.py`, `quality_ingest_service.py`, `notification_service.py`). Jangan pakai insert biasa untuk data yang mungkin di-retry (gateway/scheduler bisa kirim ulang).

**Anti-enumeration**: 404 seragam untuk resource yang bukan milik user (kolam), respons generik untuk `/auth/forgot-password` (tidak pernah bilang beda antara email terdaftar vs tidak).

**Degradasi graceful untuk integrasi opsional**: SMTP (`core/email.py`) dan Firebase push (`core/push.py`) — kalau belum dikonfigurasi (`SMTP_HOST`/`FIREBASE_CREDENTIALS_PATH` kosong), fungsi SKIP dengan `logger.warning`, TIDAK raise exception. In-app notification tetap tercatat walau push/email gagal terkirim. Pertahankan pola ini untuk integrasi eksternal baru — jangan bikin fitur inti gagal gara-gara dependency eksternal belum diset.

**Isolasi error per-item dalam loop**: scheduler (`scheduler.py`) proses tiap device dalam `try/except` terpisah — satu device error tidak boleh menghentikan device lain dalam siklus yang sama. Pola yang sama dipakai untuk dispatch push per token.

**Scheduler ML** (`services/scheduler.py` + `ml_pipeline_service.py`, APScheduler) adalah **jalur sementara di sisi cloud/backend**, bukan desain akhir — nantinya pipeline ini pindah jalan di Raspberry Pi (edge computation) sesuai dokumen desain. `ml/` di-mount read-only ke container backend (`./ml:/app/ml:ro` di `docker-compose.yml`) supaya bisa di-`import` langsung — bukan lewat HTTP self-call.

**Notifikasi**: dua sumber, dua strategi dedup berbeda — `classification` (status sekarang) pakai transition-check (cuma notif kalau kategori berubah dari notifikasi terakhir, supaya tidak spam tiap siklus scheduler selama anomali berlangsung); `prediction` (forecast) dedup otomatis lewat `UNIQUE (device_id, source, event_time)` karena `event_time`-nya (`target_time`) absolut per horizon.

**Generator data sintetis** (`ml/scripts/synthetic_data_generator.py`) SENGAJA berdiri sendiri, tidak diimpor modul lain. Begitu data asli dari hardware mengalir, file ini tinggal dihapus tanpa mengubah apa pun di tempat lain. Jangan couple-kan file ini ke kode produksi.

## Konvensi kode

- Docstring & komentar: **Bahasa Indonesia**, sering merujuk eksplisit ke bagian/tabel/persamaan proposal tesis (mis. "Persamaan 26-27", "Tabel 3.18") — ini disengaja, jangan dihapus, referensi itu penting buat penulisan laporan TA nanti.
- Identifier (nama variabel/fungsi/kelas): **Bahasa Inggris**.
- Router tipis, logic di `services/`. Jangan taruh query database langsung di router.
- Schema Pydantic: suffix `In` untuk request body, `Out` untuk response.
- File SQL di `database/init/` diberi nomor urut (`01_...` s.d. `08_...` saat ini) dan idempoten (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Nama produk: **sismon_kepiting** (bukan nama generik lain) — dipakai konsisten di `PROJECT_NAME`, `POSTGRES_USER`/`POSTGRES_DB`, container name Docker. Device seed: `master`, `SLV1`, `SLV2`, `SLV3`.
- Placeholder secret di `.env.example` sengaja diisi `ai-dilarangbaca` (bukan nilai asli, bukan format password sungguhan) — nilai asli cuma di `.env` lokal (gitignored), jangan pernah commit `.env` asli.

## GOTCHA paling sering bikin bingung

File di `database/init/*.sql` **cuma auto-jalan sekali**, saat volume `pgdata` masih kosong. Kalau nambah file SQL baru setelah volume sudah pernah dibuat (mis. abis `git pull` ada migrasi baru), file itu TIDAK otomatis jalan — harus apply manual:

```bash
docker compose exec db psql -U sismon_kepiting -d sismon_kepiting_db -f /docker-entrypoint-initdb.d/<nama_file>.sql
```

Kalau ada endpoint tiba-tiba error "relation does not exist" padahal kode sudah benar, ini penyebabnya duluan yang dicurigai.

## Testing

`backend/tests/` jalan **langsung ke DB dev yang sama** (docker-compose `db`+`backend` harus `up`), bukan DB test terpisah — keputusan pragmatis untuk skala proyek ini, belum ada infrastruktur test DB terisolasi. Test bikin data dummy dengan suffix UUID acak dan membersihkan sendiri di blok `finally`. `pytest.ini` set `pythonpath = ..` karena `app.main` transitif meng-import `ml.fuzzy.*` lewat scheduler, dan `ml/` adalah sibling `backend/`, bukan subfolder-nya.

Jalankan: `cd backend && pytest`

## Perintah umum

```bash
docker compose up --build -d          # jalankan semua service
docker compose logs backend --tail=50 # cek scheduler/error
curl http://localhost:8000/health
# Swagger UI selalu aktif & paling update, cek di sini kalau ragu kontrak endpoint:
open http://localhost:8000/docs

python ml/scripts/synthetic_data_generator.py --backfill-hours 48   # isi data dummy
python ml/scripts/test_e2e_classification.py                        # trigger manual klasifikasi
python ml/scripts/forecast_anomaly_scan.py --device-code SLV1       # trigger manual prediksi + scan anomali
python ml/scripts/backtest_fts_horizon.py --device-code SLV1        # validasi RMSE per horizon
```

## Konvensi pengetesan/verifikasi

Setiap kali diminta "lakukan pengetesan", "verifikasi", "cek apakah jalan", atau
kalimat senada — WAJIB pakai automasi browser + screenshot sebagai bukti, BUKAN
cuma laporan teks/log tanpa gambar. Kalau ada tool browser automation terpasang
(mis. Playwright/Chrome DevTools MCP), pakai itu; kalau belum ada, beri tahu di
awal bahwa tool browser belum tersedia sebelum lanjut ke alternatif teks.

Karena saat ini web/mobile belum di-scaffold, target browser untuk endpoint
backend adalah **Swagger UI** (`http://localhost:8000/docs`):
1. Buka `/docs` di browser.
2. Expand endpoint yang mau diuji, klik "Try it out", isi payload/header
   (`X-API-Key` atau `Authorization: Bearer <token>` sesuai endpoint).
3. Execute, lalu screenshot request DAN response-nya (bukan cuma salah satu).
4. Kalau alurnya multi-step (mis. register -> login -> pakai token -> claim
   device -> baca data), screenshot tiap step secara berurutan, jangan cuma
   step terakhir — supaya kelihatan alurnya benar dari awal, bukan cuma hasil
   akhirnya kebetulan benar.

Begitu `web/` atau `mobile/` sudah mulai ada halaman/screen sungguhan, prinsip
yang sama berlaku ke situ: buka halamannya di browser (atau device
emulator untuk mobile web view kalau memungkinkan), lakukan aksinya, screenshot
tiap langkah penting — jangan cuma andalkan curl/pytest buat sesuatu yang
sebenarnya punya tampilan visual untuk dicek.

Screenshot disimpan di lokasi yang jelas (mis. folder sementara di root repo atau
sesuai instruksi sesi) dan disebutkan path-nya di laporan hasil verifikasi — jangan
cuma bilang "sudah diverifikasi" tanpa lampiran buktinya.

## Status saat ini (cek ulang kondisi aktual sebelum percaya buta — bagian ini gampang basi)

Sudah ada: auth lengkap (register/login/me/ganti password/lupa password via email/reset password), kolam + isolasi kepemilikan (teruji), ingest gateway, readings, quality (latest + multi-horizon predictions), topologi device per kolam, notifikasi in-app + push (FCM) dengan dedup, scheduler otomatis ML, generator data sintetis terpisah, git sudah ter-commit.

Belum ada / belum dikerjakan: Alembic (dependency sudah ada di `requirements.txt`, belum `alembic init`), test coverage otomatis masih cuma satu file (`test_kolam_isolation.py`), TimescaleDB retention/compression policy belum diaktifkan, `CORS_ORIGINS` masih default `localhost:3000` (perlu ditambah kalau web di-deploy ke domain lain), `web/`/`mobile/`/`firmware/` masih folder kosong (belum di-scaffold).
