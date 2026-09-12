# KrabCare: Frontend Web

Frontend web untuk Sistem Monitoring Kualitas Air pada Budidaya Kepiting Sistem
Vertikal (dokumen `CD_GAB` Bab 3.3.5). Next.js 14 (App Router), TypeScript, dan
Tailwind CSS, sesuai tumpukan teknologi di proposal.

Backend ada di monorepo yang sama: `../backend/` (FastAPI).

## Struktur folder

```
web/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                 # Root layout, metadata, favicon
│  │  ├─ globals.css                # Design token & style dasar (Tailwind)
│  │  ├─ page.tsx                   # Redirect "/" ke "/login"
│  │  ├─ login/page.tsx             # Gambar 3.27: Halaman Login
│  │  ├─ daftar/page.tsx            # Pendaftaran akun
│  │  ├─ lupa-sandi/page.tsx        # Gambar 3.28: Halaman Lupa Sandi
│  │  ├─ reset-password/page.tsx    # Set sandi baru dari link email
│  │  ├─ verifikasi-email/page.tsx  # Aktivasi akun dari link email
│  │  └─ (app)/                     # Grup rute setelah login (Sidebar + Topbar)
│  │     ├─ layout.tsx              # Guard token
│  │     ├─ dashboard/page.tsx      # Gambar 3.29: Dashboard + detail rak inline
│  │     ├─ log-historis/page.tsx   # Gambar 3.31: Log Historis + ekspor
│  │     ├─ notifikasi/page.tsx     # Gambar 3.32: Notifikasi & Prediksi
│  │     ├─ perangkat/page.tsx      # Kelola device (khusus admin)
│  │     └─ profil/page.tsx         # Gambar 3.33: Profil
│  ├─ components/
│  │  ├─ ui/          # Button, Input, Card, StatusBadge, HourSelect, Skeleton
│  │  ├─ layout/      # Sidebar, Topbar, MobileNav, AccountChip, Logo
│  │  ├─ dashboard/   # PondCard, Rail
│  │  ├─ kolam/       # RakDetail, ParameterStrip, PredictionPanel, grafik
│  │  ├─ log/         # ExportPanel
│  │  └─ notifikasi/  # NotificationItem
│  └─ lib/
│     ├─ api.ts       # Pemanggilan REST API ke backend
│     ├─ types.ts     # Tipe data, mengikuti schema Pydantic backend
│     ├─ parameter.ts # Ambang & penyajian pH, suhu, salinitas
│     ├─ ammonia.ts   # Penyajian indeks risiko amonia
│     ├─ export.ts    # Ekspor CSV & XLSX
│     └─ tanggal.ts   # Format tanggal dd-mm-yyyy
├─ tailwind.config.ts # Design token (warna, font, animasi)
└─ package.json
```

## Menjalankan proyek

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`, akan diarahkan ke `/login`.

Alamat backend diambil dari `NEXT_PUBLIC_API_BASE_URL`, defaultnya
`http://localhost:8000/api/v1`. Nilainya di-inline saat build, jadi perubahannya
baru berlaku setelah build ulang.

## Menyambungkan ke backend

Semua pemanggilan API ada di `src/lib/api.ts`, dan path-nya mengikuti route di
`backend/app/routers/*`. Kalau ada rute backend yang berubah, ubah di berkas itu
saja; halaman memanggil lewat `api.*` dan tidak menyimpan path sendiri.

## Catatan desain

- **Palet "Muara"** merepresentasikan air payau, lumpur mangrove, dan cangkang
  kepiting. Token warnanya di `tailwind.config.ts`.
- Status kualitas air memakai tiga warna yang sama di seluruh halaman: Aman
  (hijau), Waspada (amber), Bahaya (merah bata), sesuai FR-08 dokumen CD GAB.
  Warnanya selalu didampingi label teks.
- Ambang parameter ada di `src/lib/parameter.ts` dan harus sinkron dengan
  `backend/app/core/water_thresholds.py`.
- Layout responsif: sidebar di desktop, bottom navigation di mobile.

## Belum termasuk

- Middleware Next.js untuk proteksi rute. Sekarang token diperiksa di klien
  (`src/app/(app)/layout.tsx`) karena token disimpan di `localStorage`.
- Push notification. Pembaruan data memakai polling 60 detik.
- Frontend mobile (Flutter), di luar cakupan folder ini.
