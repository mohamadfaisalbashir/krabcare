# sismon_kepiting — Frontend Web

Frontend web untuk **Sistem Monitoring Kualitas Air pada Budidaya Kepiting Sistem
Vertikal** (lihat dokumen `CD_GAB` Bab 3.3.5). Dibangun dengan **Next.js 14 (App
Router) + TypeScript + Tailwind CSS**, sesuai tumpukan teknologi yang ditetapkan
pada proposal (frontend Next.js, backend FastAPI).

Backend berada di monorepo yang sama: `../backend/` (FastAPI).

## Struktur folder

```
web/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx              # Root layout + font
│  │  ├─ globals.css             # Design tokens & style dasar (Tailwind)
│  │  ├─ page.tsx                # Redirect "/" -> "/login"
│  │  ├─ login/page.tsx          # Gambar 3.27 — Halaman Login
│  │  ├─ lupa-sandi/page.tsx     # Gambar 3.28 — Halaman Lupa Sandi
│  │  └─ (app)/                  # Grup rute setelah login (pakai Sidebar+Topbar)
│  │     ├─ layout.tsx
│  │     ├─ dashboard/page.tsx        # Gambar 3.29 — Dashboard
│  │     ├─ kolam/[id]/page.tsx       # Gambar 3.30 — Detail Kolam
│  │     ├─ log-historis/page.tsx     # Gambar 3.31 — Log Historis
│  │     ├─ notifikasi/page.tsx       # Gambar 3.32 — Notifikasi & Prediksi
│  │     └─ profil/page.tsx           # Gambar 3.33 — Profil
│  ├─ components/
│  │  ├─ ui/           # Button, Input, Card, StatusBadge (Aman/Waspada/Bahaya)
│  │  ├─ layout/        # Sidebar, Topbar, MobileNav, Logo
│  │  ├─ dashboard/     # PondCard
│  │  ├─ kolam/         # ParameterGauge, HistoryChart (recharts)
│  │  └─ notifikasi/    # NotificationItem
│  ├─ lib/
│  │  ├─ types.ts       # Tipe data (Pond, Notification, HistoryLogEntry, dll)
│  │  ├─ api.ts         # Lapisan pemanggilan RESTful API ke backend FastAPI
│  │  └─ mock-data.ts   # Data contoh, dipakai sebagai fallback saat backend
│  │                     # belum tersambung, agar tampilan tetap bisa dikembangkan
│  └─ hooks/
├─ tailwind.config.ts   # Design tokens (warna, font)
├─ package.json
└─ .env.local.example
```

## Menjalankan proyek

```bash
npm install
cp .env.local.example .env.local   # lalu isi NEXT_PUBLIC_API_BASE_URL
npm run dev
```

Buka `http://localhost:3000` — akan diarahkan otomatis ke `/login`.

## Menyambungkan ke backend

Semua pemanggilan API dikumpulkan di satu tempat: `src/lib/api.ts`. Saat
backend FastAPI (repo `Kepiting-Zaman-Purba`) sudah punya rute pasti,
sesuaikan:

1. `NEXT_PUBLIC_API_BASE_URL` pada `.env.local`.
2. Path endpoint di `src/lib/api.ts` (mis. `/auth/login`, `/ponds`,
   `/ponds/:id/readings`, `/notifications`, dst) agar sesuai nama rute asli
   di backend.
3. Setiap halaman sudah memanggil fungsi dari `api.ts` lebih dulu, dan hanya
   jatuh ke `mock-data.ts` sebagai fallback bila permintaan gagal — sehingga
   begitu backend aktif dan path-nya sudah cocok, data asli otomatis tampil
   tanpa perlu mengubah halaman.

## Catatan desain

- **Palet warna & tipografi** ("Muara") merepresentasikan air payau,
  lumpur mangrove, dan cangkang kepiting — lihat token warna di
  `tailwind.config.ts`.
- **Elemen signature**: motif riak air (`ripple-rule`, logo, dan pola latar
  pada panel login) serta gauge cincin pada halaman Detail Kolam,
  menggantikan progress bar generik.
- Status kualitas air memakai tiga warna konsisten di seluruh halaman:
  **Aman** (hijau), **Waspada** (kuning kecoklatan/amber), **Bahaya** (merah
  bata) — sesuai FR-08 pada dokumen CD GAB.
- Layout responsif: sidebar di desktop, bottom navigation di mobile.

## Belum termasuk (langkah selanjutnya)

- Autentikasi/proteksi rute nyata (saat ini hanya memeriksa token di
  `localStorage`; sebaiknya ditambahkan middleware Next.js untuk redirect
  otomatis bila token tidak ada).
- Integrasi push/soft-real-time (polling berkala) ke endpoint backend.
- Frontend aplikasi mobile (Flutter) — di luar cakupan folder ini.
