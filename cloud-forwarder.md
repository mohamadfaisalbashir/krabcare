# Cloud forwarder: kenapa muncul "Gagal konek ke cloud (quality)"

Catatan ini menjelaskan pesan error di log `krabcare-cloud-forwarder` yang muncul
padahal datanya sudah diterima server, apa yang sudah diperbaiki, dan apakah
pengirimannya bisa dibuat paralel.

## Ringkasan

- Koneksinya **berhasil**, yang terlambat adalah **balasan** server.
- Server menyimpan data lalu memproses notifikasi **sebelum** membalas. Untuk
  batch besar, waktunya bisa lebih dari batas tunggu forwarder (10 detik).
- Forwarder menganggap kirimannya gagal, mencetak `Gagal konek ke cloud (quality)`,
  lalu mengirim ulang data yang sebenarnya sudah tersimpan. Server menolaknya
  sebagai duplikat, jadi tidak ada data dobel, hanya kiriman yang sia-sia.
- Ini **berbeda** dari error `Failed to resolve 'api.krabcare.com'`
  (`NameResolutionError`). Yang itu berarti internet atau DNS di Raspberry Pi
  memang putus.

## Alur sebelum perbaikan

```
Raspberry Pi (forwarder)                 Server (POST /api/v1/ingest/quality)
────────────────────────                 ─────────────────────────────────────
kirim batch quality  ───────────────▶    1. simpan klasifikasi, prediksi, amonia   (cepat)
                                            → data sudah aman di database
tunggu balasan, maks 10 detik            2. proses notifikasi                       (lambat)
        ⋮                                   - cek status sebelumnya per baris
        ⋮                                   - buat notifikasi
        ⋮                                   - kirim push FCM ke HP
detik ke-10: berhenti menunggu
"Gagal konek ke cloud (quality)"
simpan lagi ke buffer                    3. balas 201                               (sudah terlambat)
        ⋮
30 detik kemudian: kirim ulang  ────▶    data ditolak sebagai duplikat
```

Langkah 2 makin lama kalau batch-nya besar, misalnya saat lima batch yang
tertahan di buffer dikirim setelah internet pulih. Push FCM juga dikirim secara
*blocking*, jadi selama satu push menunggu jawaban Google, server tidak
mengerjakan apa pun.

Pesan errornya menyesatkan karena forwarder menulis "Gagal konek" untuk semua
jenis kegagalan `requests`, termasuk *timeout* menunggu balasan.

## Perbaikan yang sudah dibuat

| Bagian | Perubahan | Berkas |
|---|---|---|
| Server | Membalas 201 begitu data tersimpan; notifikasi diproses **sesudah** balasan terkirim (`BackgroundTasks`) | `backend/app/routers/ingest.py` |
| Server | Push FCM dijalankan di thread terpisah (`asyncio.to_thread`) supaya tidak menahan permintaan lain | `backend/app/services/notification_service.py` |
| Server | Notifikasi latar diproses satu per satu sesuai urutan kiriman (`asyncio.Lock`) | `backend/app/routers/ingest.py` |
| Forwarder | Batas tunggu dinaikkan dari 10 ke 30 detik untuk jaga-jaga sinyal GSM lambat | `raspi/cloud_forwarder_watch.py`, `raspi-data/kirim_ke_cloud/cloud_forwarder_watch.py` |
| Forwarder | Pesan error mencantumkan jenisnya, mis. `ReadTimeout` atau `NameResolutionError` | berkas yang sama |

Hasil uji di server lokal: batch quality 300 baris dibalas dalam sekitar
**120 ms**, dan notifikasi tetap terbentuk di latar.

Cara membaca log forwarder setelah perbaikan dipasang:

| Muncul di log | Artinya |
|---|---|
| `ReadTimeout` | Server lambat membalas (kasus di atas). Seharusnya sudah tidak muncul. |
| `NameResolutionError`, `ConnectionError` | Internet atau DNS di Pi putus. Cek sinyal/kuota SIM7600 atau WiFi. |
| `[FATAL] 401` | `GATEWAY_API_KEY` di `/home/pi/TA_Kepiting/.env` salah. |

## Bisa nggak dibuat paralel?

Ada tiga tempat yang berjalan berurutan. Jawabannya berbeda untuk tiap tempat.

### 1. Server: simpan lalu notifikasi

**Sudah dipisah.** Penyimpanan tetap sebelum balasan (supaya forwarder tahu
datanya aman), notifikasi jalan di latar sesudah balasan. Inilah perbaikan
utamanya.

Notifikasi di latar **sengaja tetap berurutan**, tidak dibuat paralel. Notifikasi
"Kondisi kolam berubah dari Aman ke Waspada" dibuat dengan membandingkan data
baru dengan notifikasi terakhir. Kalau dua batch diproses bersamaan, keduanya
bisa membaca status lama yang sama, sehingga notifikasinya dobel atau
urutannya keliru.

Kuncinya per proses, cukup karena produksi berjalan dengan satu worker uvicorn.
Kalau worker ditambah, kuncinya perlu dipindah ke *advisory lock* Postgres.

### 2. Forwarder: pengiriman langsung (setiap file berubah)

Saat ini readings dan quality dikirim dari **satu thread** yang sama (thread
watchdog). Kalau kiriman quality sedang menunggu, kiriman readings berikutnya
ikut antre.

**Bisa diparalelkan**: satu thread/antrean untuk readings dan satu untuk quality.
Keduanya data yang berbeda, dan server sudah mengurutkan notifikasinya sendiri.
Urutan **di dalam** tiap jenis tetap harus berurutan. Manfaatnya kecil setelah
perbaikan server, karena tiap kiriman sekarang cuma butuh ratusan milidetik
ditambah waktu tempuh jaringan GSM.

### 3. Forwarder: kirim ulang buffer

Isi buffer dikirim satu batch demi satu batch, dan berhenti di batch pertama
yang gagal. **Tidak disarankan dibuat paralel**:

- **Urutan penting.** Batch lama yang tiba setelah batch baru membuat notifikasi
  "berubah dari ... ke ..." memakai data lama sebagai kondisi terkini.
- **Tidak lebih cepat.** Semua kiriman berbagi satu jalur GSM yang sama. Beberapa
  kiriman sekaligus saling berebut, dan risiko timeout malah naik.
- **Gagal sebagian lebih rumit.** Kalau sebagian berhasil dan sebagian gagal,
  forwarder harus melacak mana yang perlu diulang tanpa merusak urutan.

Yang lebih efektif adalah **menggabungkan** beberapa batch buffer jadi satu
kiriman (mis. sampai 1.000 baris per POST). Jumlah perjalanan bolak-balik ke
server berkurang, urutan tetap terjaga, dan server sudah membalas cepat
berapa pun ukurannya.

## Rekomendasi

1. Pasang perbaikan yang sudah ada: rebuild backend di VPS, lalu salin
   `cloud_forwarder_watch.py` yang baru ke Pi dan restart
   `krabcare-cloud-forwarder`.
2. Pantau log forwarder beberapa hari. Kalau `ReadTimeout` sudah tidak muncul,
   pengiriman berurutan tidak lagi jadi masalah.
3. Kalau buffer sering menumpuk setelah internet putus lama, tambahkan
   penggabungan batch buffer (poin 3). Pemisahan thread readings dan quality
   (poin 2) baru perlu kalau kiriman langsung masih terasa tertahan.

## Langkah pemasangan

```bash
# VPS: backup dulu, lalu rebuild backend
./scripts/backup_db.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend

# Raspberry Pi: salin forwarder baru, lalu
sudo systemctl restart krabcare-cloud-forwarder
sudo journalctl -u krabcare-cloud-forwarder -f
```
