Lanjutan dari perbaikan.md. Tugasnya: MENUTUP DRIFT antara model SQLAlchemy dan
skema database, supaya `alembic revision --autogenerate` menghasilkan file KOSONG.

Kenapa ini penting, bukan sekadar rapi-rapi: selama autogenerate masih menghasilkan
operasi, hasilnya tidak bisa dipercaya. Orang berikutnya yang menambah kolom lalu
menjalankan autogenerate akan mendapat file yang — selain kolom barunya — juga
berisi DROP INDEX dan DROP CONSTRAINT. Kalau file itu di-apply di VPS tanpa dibaca
baris per baris, 6 index hilang dan dedup notifikasi mati. Perbaikannya harus
sekarang, selagi belum ada migrasi kedua.

PRINSIP UTAMA: yang diperbaiki adalah DEKLARASI MODEL, bukan database. Skema DB
sudah benar dan sudah berisi data. Model yang kurang lengkap mendeklarasikannya.
Satu-satunya pengecualian adalah Bagian D, dan itu justru untuk membuat DB dev
menyusul SQL init, bukan sebaliknya.

Baca CLAUDE.md dulu. JANGAN commit git — biar di-commit manual.

=====================================================================
BAGIAN A — TIPE TIMESTAMP DI MODEL
=====================================================================

Semua kolom `created_at`/`updated_at`/`last_seen_at` dideklarasikan
`Mapped[datetime]` polos, sehingga SQLAlchemy memetakannya ke `DateTime()`
(tanpa timezone). Skema DB memakai `TIMESTAMPTZ`. Autogenerate menawarkan 14
ALTER COLUMN gara-gara ini.

Polanya sudah ada di repo dan tinggal diikuti — `notifications.event_time`,
`users.reset_token_expires_at`, dan seluruh model hypertable sudah memakai
`TIMESTAMP(timezone=True)` secara eksplisit. Yang belum cuma kolom audit.

Tambahkan `TIMESTAMP(timezone=True)` ke kolom berikut:
- devices: last_seen_at, created_at, updated_at
- kolam: created_at, updated_at
- users: created_at, updated_at
- notifications: created_at
- push_tokens: created_at, last_used_at
- fuzzy_classifications: created_at
- fuzzy_predictions: created_at

JANGAN mengubah skema database untuk bagian ini. DB sudah TIMESTAMPTZ dan itu
yang benar — data sensor punya timezone, kolom tanpa timezone justru bug.

=====================================================================
BAGIAN B — INDEX & CONSTRAINT YANG TIDAK DIDEKLARASIKAN MODEL
=====================================================================

B1. Enam index ini ada di DB (dibuat database/init/*.sql) tapi tidak ada di model,
sehingga autogenerate menawarkan DROP:

    idx_devices_parent              devices (parent_device_id)          02_tables.sql
    idx_devices_kolam               devices (kolam_id)                  06_kolam.sql
    idx_kolam_owner                 kolam (owner_user_id)               06_kolam.sql
    idx_fuzzy_predictions_device_target
                                    fuzzy_predictions (device_id, target_time DESC)
                                                                        02_tables.sql
    idx_notifications_user          notifications (user_id, created_at DESC)
                                                                        08_notifications.sql
    idx_push_tokens_user            push_tokens (user_id)               08_notifications.sql

Deklarasikan di `__table_args__` masing-masing model. Nama index HARUS sama persis
dengan yang di SQL, kalau tidak Alembic malah menawarkan rename (DROP + CREATE).
Untuk yang DESC, pakai `sa.text("created_at DESC")` — ini bukan sekadar kosmetik,
urutan kolom index memang begitu di DB.

B2. UNIQUE (device_id, source, event_time) di tabel notifications tidak ada di
model, sehingga autogenerate menawarkan DROP CONSTRAINT
`notifications_device_id_source_event_time_key`.

Constraint ini adalah SATU-SATUNYA mekanisme dedup notifikasi sumber `prediction`
(lihat CLAUDE.md: "prediction (forecast) dedup otomatis lewat
UNIQUE (device_id, source, event_time)"). Deklarasikan sebagai `UniqueConstraint`
di `__table_args__`, DENGAN nama eksplisit persis seperti di atas supaya cocok
dengan nama yang sudah dipakai Postgres.

B3. Tiga index `*_time_idx` (sensor_readings_time_idx, fuzzy_classifications_time_idx,
fuzzy_predictions_time_idx) BUKAN milik kita — dibuat otomatis oleh
`create_hypertable()` TimescaleDB (lihat 03_hypertables.sql).

JANGAN dideklarasikan di model. Mendeklarasikan objek yang dibuat pihak lain itu
bohong: kalau suatu saat ada yang membuat tabel dari metadata, index-nya akan
bentrok dengan yang dibuat create_hypertable.

Yang benar: saring lewat `include_object` di backend/alembic/env.py — ini persis
kasus "objek internal TimescaleDB" yang diantisipasi perbaikan.md C6, cuma
objeknya ada di skema public, bukan _timescaledb_*. Saring HANYA index hasil
refleksi (reflected=True) yang namanya berakhiran `_time_idx`.

=====================================================================
BAGIAN C — NULLABILITY push_tokens.last_used_at
=====================================================================

DB: `last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()` (08_notifications.sql:25)
Model: `Mapped[datetime | None]` — nullable.

Autogenerate menawarkan mengubah kolom jadi NULL-able. Jangan diterapkan ke DB.
Yang salah modelnya: satu-satunya penulis kolom ini
(`notification_service.py:152`) selalu mengisi `func.now()`, tidak pernah None.

Perbaiki model jadi non-nullable, tetap dengan `server_default=func.now()`.

=====================================================================
BAGIAN D — DB DEV YANG MENYIMPANG (satu-satunya perubahan skema)
=====================================================================

Temuan dari perbaikan.md langkah 8: `notifications.quality_category` di DB dev
bertipe `text`, padahal 08_notifications.sql menuliskannya
`water_quality_category` (enum native). Sudah dibuktikan dengan mem-boot DB
throwaway dari database/init/ — hasil fresh-nya enum. Artinya tabel notifications
di DB dev dibuat dari versi lama file itu, lalu `CREATE TABLE IF NOT EXISTS` diam-
diam melewatkan perbaikannya.

Akibatnya dev != prod: VPS yang boot pertama kali akan dapat enum, dev tetap text.
Model sudah benar (native enum, create_type=False) — yang perlu menyusul DB dev.

D1. Buat SATU migrasi Alembic (bukan file SQL baru, folder init sudah beku) yang
mengubah kolom itu jadi `water_quality_category`.

D2. Migrasi ini WAJIB kondisional. Di VPS kolomnya sudah enum, dan migrasi yang
sama akan ikut jalan di sana. Periksa dulu tipe kolom lewat information_schema,
kalau sudah `water_quality_category` langsung `return` tanpa melakukan apa-apa.
Migrasi yang meledak di server produksi karena kondisi di sana berbeda adalah
persis yang mau kita hindari dengan Alembic.

D3. Tulis `downgrade()` yang benar (kembali ke TEXT), sesuai aturan di README.
Catat di docstring bahwa downgrade selalu menghasilkan TEXT, termasuk pada
database yang aslinya sudah enum — ini konsekuensi sadar dari migrasi
kondisional, bukan kelalaian.

D4. Konversinya pakai `USING quality_category::water_quality_category`. Tanpa
USING, Postgres menolak konversi text -> enum.

Sebelum menjalankan: PASTIKAN notifications bukan hypertable (cek
03_hypertables.sql). Kalau ternyata hypertable, HENTIKAN dan lapor — ALTER TYPE
pada hypertable berisi data punya konsekuensi lain dan perlu dibicarakan dulu.

=====================================================================
BAGIAN E — SISA NOISE: TEXT vs Enum(native_enum=False)
=====================================================================

`devices.device_type` dan `users.role` di DB bertipe `TEXT` + CHECK constraint.
Model memakai `SAEnum(..., native_enum=False)`, yang oleh SQLAlchemy dirender
sebagai `VARCHAR(n)` + CHECK. Maksudnya sama persis (string dibatasi CHECK),
cuma tipe stringnya beda nama.

JANGAN mengubah DB jadi VARCHAR hanya demi ini. TEXT dan VARCHAR tanpa panjang
identik di Postgres, dan VARCHAR(11) justru menambah batas panjang yang tidak
diminta siapa pun.

JANGAN pula mengganti tipe model jadi Text — itu menghilangkan koersi enum saat
baca, jadi perubahan perilaku sungguhan demi kosmetik.

Yang benar: tambahkan `compare_type` di env.py yang menganggap
(DB TEXT) vs (model Enum non-native) sebagai SAMA. Buat sesempit mungkin —
hanya kombinasi itu, dan kembalikan None (perilaku default Alembic) untuk semua
kombinasi lain, supaya perubahan tipe yang sungguhan tetap terdeteksi.

Catat di komentar bahwa ini pengecualian yang disengaja, lengkap dengan alasannya.

=====================================================================
VERIFIKASI — jalankan dan laporkan hasil tiap langkah, jangan diasumsikan
=====================================================================

1. `docker compose up -d` — stack dev tetap jalan, backend healthy.
2. `docker compose exec backend alembic upgrade head` — migrasi Bagian D jalan.
   Tampilkan output-nya.
3. Buktikan kolomnya benar-benar berubah:
   `docker compose exec db psql ... -c "SELECT udt_name FROM information_schema.columns
    WHERE table_name='notifications' AND column_name='quality_category';"`
   Harus `water_quality_category`, bukan `text`.
4. Uji migrasi D dua arah: `alembic downgrade -1`, pastikan kolom kembali `text`,
   lalu `alembic upgrade head` lagi. Kalau downgrade gagal, itu bug — laporkan.
5. INTI DARI SEMUANYA:
   `docker compose exec backend alembic revision --autogenerate -m "cek drift 2"`
   File yang dihasilkan HARUS kosong (upgrade() dan downgrade() cuma `pass`).
   Tampilkan ISI FILE-nya, jangan cuma bilang "kosong". Kalau masih ada operasi
   tersisa, laporkan apa adanya — jangan dipaksa hilang dengan menambah filter
   baru di env.py. Hapus file percobaan ini setelahnya.
6. Buktikan filter di env.py tidak kebablasan menyembunyikan perubahan sungguhan:
   ubah sementara satu model (mis. tambah kolom nullable di kolam), jalankan
   autogenerate lagi, pastikan perubahan itu MASIH TERDETEKSI. Kembalikan model
   dan hapus file percobaannya.
7. `docker compose exec backend python -m pytest -q` — test lulus.
   (host belum punya pytest terinstall, jadi jalankan di dalam container)
8. Pastikan 6 index dan 1 unique constraint dari Bagian B masih ADA di DB
   setelah semua langkah di atas — query pg_indexes dan pg_constraint.
   Ini pengecekan paling penting: seluruh latihan ini sia-sia kalau justru
   menghapus objek yang mau dilindungi.
9. `git status` — pastikan tidak ada .env asli atau isi backups/ yang ter-stage.

Laporkan hasil tiap langkah termasuk yang gagal.
