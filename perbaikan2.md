# Prompt untuk Claude Code — Ingest Dataset NERR + Benchmark Model FTS

Konteks: dataset riil NOAA NERRS SWMP sudah diunduh, akan dipakai untuk membangun
FLRG dan mengukur RMSE model FTS Chen yang sudah ada di `ml/fuzzy/fts.py`.
Dataset menggantikan `synthetic_data_generator.py` sebagai sumber data utama —
generator sintetis TETAP ada, turun peran jadi alat uji jalur anomali saja.

## Dataset

Letakkan file zip terekstrak di `data/nerr/` (buat folder, tambahkan ke `.gitignore` —
29 MB, jangan masuk repo).

Stasiun: `gndblwq` (Grand Bay NERR, Bangs Lake, Mississippi), stasiun primer.
File: `gndblwq2020.csv` .. `gndblwq2024.csv`, 175.392 baris total, interval 15 menit.

Kolom relevan (header pakai tanda kutip ganda, ada trailing comma tiap baris):
- `DateTimeStamp` — format `MM/DD/YYYY H:MM`, BUKAN ISO. Parse eksplisit
  dengan `format='%m/%d/%Y %H:%M'`, jangan andalkan inferensi pandas.
- `Temp` (°C), `pH`, `Sal` (ppt) — sudah satuan yang benar, tidak perlu konversi.
- `F_Temp`, `F_pH`, `F_Sal` — flag QAQC, format `<kode> [KUALIFIER] (KUALIFIER)`.
- `SpCond` — konduktivitas spesifik, simpan untuk keperluan validasi sensor TDS nanti.

## Tugas 1 — `ml/scripts/import_nerr_dataset.py` (file baru, STANDALONE)

Ikuti pola `synthetic_data_generator.py`: berdiri sendiri, argparse, tidak diimpor
modul mana pun, docstring Indonesia + identifier Inggris.

Boleh pakai pandas (tambahkan ke requirements script-level kalau perlu), TIDAK boleh
menambah dependency ke `backend/requirements.txt` — script ini jalan di host.

Pipeline yang harus diimplementasikan, urut:

1. Baca seluruh CSV di folder input, gabung, parse `DateTimeStamp`.
2. Ekstrak kode flag dengan regex `^<(-?\d+)>` dari `F_Temp`/`F_pH`/`F_Sal`.
   PENTING: hanya angka di dalam `<>` yang menentukan. `<0> [GSM] (CWD)` LOLOS.
3. Simpan HANYA baris yang ketiga flagnya berkode `0`. Ini membuang ~23,6% baris
   dan menghilangkan nilai rusak seperti pH -88,7 dan Temp -6,6 yang ADA di data
   mentah. Jangan filter berdasarkan rentang nilai — filter berdasarkan flag.
4. Argumen `--months` (default `5-10`) untuk memotong ke musim hangat. Alasannya
   Grand Bay subtropis: sepanjang tahun cuma 62,4% suhu masuk universe [20,35],
   tapi Mei-Oktober naik jadi 96,7%. Sisa bulan dipakai sebagai data uji
   out-of-range (lihat Tugas 3).
5. Rename ke skema `SensorReadingBatchIn`:
   `DateTimeStamp -> time` (ISO 8601), `Temp -> temperature_c`, `pH -> ph`,
   `Sal -> salinity_ppt`.
6. POST batch ke `POST /api/v1/ingest/readings` dengan `X-API-Key`.
   Batch 500-1000 baris per request, JANGAN satu request untuk 67 ribu baris.
   Cetak progres + `inserted`/`skipped_duplicates` per batch.

CLI:
- `--input-dir` (default `data/nerr`)
- `--device-code` (default `NERR-GNDBL`) — device khusus benchmark, HARUS terpisah
  dari device produksi `RAKA-*` supaya data riset tidak mencemari data mitra
- `--months` (default `5-10`, terima `1-12` untuk seluruh tahun)
- `--years` (default `2020-2024`)
- `--base-url`, `--api-key` (pola env sama seperti script lain)
- `--dry-run` — hitung dan cetak statistik saja, tanpa POST

Sebelum POST, selalu cetak ringkasan: jumlah baris mentah, jumlah lolos QAQC,
persentase dalam universe per parameter, jumlah dan durasi celah temporal.
Ini yang jadi bahan Bab 4 skripsi, jangan diam-diam.

Tambahkan seed device `NERR-GNDBL` ke `database/init/` sebagai file SQL BARU
(jangan ubah `04_seed_dev_devices.sql` yang sudah ada). Ingat catatan README:
file SQL baru tidak auto-jalan kalau volume `pgdata` sudah pernah dibuat, jadi
sertakan perintah apply manualnya di output akhir script.

## Tugas 2 — perbaiki pembentukan FLR terhadap celah temporal

Periksa `ml/fuzzy/fts.py`. Dataset riil punya 134 celah >15 menit, 23 celah >24 jam,
dan satu celah 67 HARI. Kalau FLR dibentuk melintasi celah itu, model belajar
transisi yang tidak pernah terjadi secara fisik.

Wajib: FLR `F(t) -> F(t+1)` hanya dibentuk kalau `t+1` persis `bucket_minutes`
setelah `t`. Kalau tidak, putus rantai dan mulai segmen baru. Semua segmen tetap
berkontribusi ke FLRG yang sama — yang dibuang hanya transisi lintas-celah.

Cek dulu apakah `aggregate_by_time_bucket` mengembalikan bucket kosong untuk
periode tanpa data, atau langsung melompat. Perilakunya menentukan cara deteksi
celah. Laporkan temuanmu sebelum mengubah kode.

## Tugas 3 — penanganan out-of-range

Nilai di luar universe HARUS punya perilaku eksplisit, bukan crash diam.
Saat ini `synthetic_data_generator.py` selalu clamp ke dalam universe, jadi jalur
ini belum pernah tereksekusi. Data riil akan langsung memicunya.

Tentukan dan implementasikan: nilai di luar `U` difuzzifikasi ke interval terdekat
(A1 kalau di bawah D_min, A_m kalau di atas D_max), TIDAK dibuang dan TIDAK error.
Log WARNING sekali per batch dengan hitungannya, bukan per titik data.

Sekalian perbaiki dua typo fungsi keanggotaan dari proposal kalau ikut tersalin
ke `ml/fuzzy/mamdani.py`:
- `mu_ST(T)` dideklarasikan `trapmf(T; 33, 35, 45, 45)` tapi bentuk piecewise di
  proposal tertulis `(20-T)/2`. Yang benar `(T-33)/2`.
- `mu_R(S)` dideklarasikan `trapmf(S; 3, 5, 8, 10)` tapi kondisi piecewise di
  proposal salah total (`8<S<10` untuk sisi naik, plateau `10<S<=30`).
  Yang benar: naik `3<S<5`, plateau `5<S<=8`, turun `8<S<10`.

Tambahkan unit test partition-of-unity: untuk tiap parameter, sampling rapat
sepanjang universe, jumlah derajat keanggotaan seluruh himpunan harus 1,0
(toleransi 1e-9) di setiap titik. Test ini menangkap sisa typo secara otomatis.

## Tugas 4 — `ml/scripts/benchmark_fts_rmse.py` (file baru, STANDALONE)

Split TEMPORAL, jangan acak — data deret waktu yang di-shuffle membocorkan masa
depan ke masa lalu.

- Bangun FLRG: 2020-2023 (musim hangat)
- Uji holdout: 2024 (musim hangat)

Output:
1. RMSE per parameter untuk h=1 (Persamaan 39/43/47 proposal).
2. RMSE per parameter untuk h=1..6 (`ML_FORECAST_STEPS=6`) — tabel degradasi
   akurasi terhadap horizon. Ini temuan yang masuk Bab 4.
3. Baseline naive (`Y_hat(t+1) = Y(t)`) sebagai pembanding. Kalau FTS tidak
   mengalahkan naive, laporkan apa adanya — itu hasil yang valid dan jujur,
   bukan kegagalan yang harus disembunyikan.
4. Distribusi kategori klasifikasi Mamdani pada data uji. Diperkirakan sangat
   condong ke "Aman" karena pH rata-rata 7,6-7,7 dan salinitas 15-21 ppt
   keduanya di pita Normal. Laporkan distribusinya, jangan diseimbangkan paksa.
5. Cetak sebagai tabel teks + simpan CSV ke `data/benchmark/`.

## Verifikasi (jalankan, laporkan hasil tiap langkah, jangan asumsikan berhasil)

1. `python ml/scripts/import_nerr_dataset.py --dry-run` — cocokkan angkanya:
   175.392 baris mentah, 134.037 lolos QAQC, 67.054 baris Mei-Okt,
   96,6% ketiganya dalam universe. Kalau meleset, parsernya salah.
2. `cd backend && pytest` — termasuk test partition-of-unity yang baru.
3. Jalankan import penuh, verifikasi jumlah baris di DB cocok dengan `inserted`.
4. `python ml/scripts/benchmark_fts_rmse.py` — laporkan tabel RMSE lengkap.
5. Jalankan import dengan `--months 11-4` ke device terpisah (`NERR-GNDBL-COLD`)
   untuk memicu jalur out-of-range. Pastikan tidak ada exception, dan WARNING
   muncul dengan hitungan yang benar.
6. `grep -rn "import_nerr_dataset\|benchmark_fts_rmse" --include="*.py" .` di luar
   file itu sendiri — harus NOL hasil, buktikan keduanya tidak terkopel.

Jangan lanjut ke langkah berikutnya kalau langkah sebelumnya belum jelas hasilnya.

## Larangan preprocessing (JANGAN berinisiatif menambahkan)

Model ini FTS Chen, bukan model gradien. JANGAN tambahkan:
- Normalisasi/standardisasi (min-max, z-score) — universe of discourse
  didefinisikan dalam satuan asli, penskalaan merusak partisi interval
- Pembuangan outlier berbasis nilai (z-score, IQR) — flag QAQC sudah
  membuang yang rusak; sisanya kejadian nyata yang justru harus terdeteksi
- Interpolasi/pengisian celah — menciptakan FLR fiktif; celah harus
  MEMUTUS rantai FLR, bukan diisi
- Smoothing/moving average — bucket 60 menit sudah menghaluskan;
  penghalusan ganda menurunkan varians dan membuat RMSE rendah palsu

Kalau menurutmu salah satu di atas tetap perlu, JANGAN kerjakan —
tanyakan dulu beserta alasannya.