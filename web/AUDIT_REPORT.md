# Audit Keselarasan `web/` dengan Backend

Audit ke-2 · 2026-08-31 · Tanpa perubahan kode — laporan saja.

> **Perubahan sejak audit pertama (2026-08-24):**
>
> - **Backend** telah diupdate: hardening deployment (docker-compose prod,
>   Caddy HTTPS, localhost-only port binding, healthcheck backend, log rotation,
>   production secret fail-fast validator), Alembic baseline. Endpoint &
>   schema API **tidak berubah** secara kontrak.
> - **Web** belum berubah sama sekali sejak audit pertama — semua gap yang
>   dilaporkan sebelumnya masih ada.
> - **CLAUDE.md** baris 153 masih bilang _"`web/` masih folder kosong (belum
>   di-scaffold)"_ — basi; `web/` sudah terisi.

---

## 1. Konvensi Struktur & Tooling

### ✅ Sudah Selaras

| Aspek | Keterangan |
|---|---|
| Tech stack | Next.js 14 + TypeScript + Tailwind — sesuai CLAUDE.md & README.md |
| Struktur `src/{app,components,lib,hooks}` | Standar App Router konvensional, rapi |
| Package manager | `npm` — konsisten (tidak ada lockfile lain) |
| `tsconfig.json` path alias `@/*` → `src/*` | Konvensi wajar |
| `.gitignore` root | Sudah ada rules `web/node_modules/`, `web/.next/`, `web/out/`, `web/.env*.local` |
| ESLint | `eslint-config-next` v14.2.35 cocok dengan Next.js 14.2.35 |
| Halaman sesuai mockup | Login, Lupa Sandi, Dashboard, Detail Kolam, Log Historis, Notifikasi & Prediksi, Profil — semua ada |
| CORS port | Backend `CORS_ORIGINS` default `["http://localhost:3000"]`, Next.js default port 3000 |
| Komentar Bahasa Indonesia, identifier Bahasa Inggris | Sesuai konvensi CLAUDE.md |
| Nama produk | ✅ Sudah diperbaiki: `sismon_kepiting` (Logo, title, README, package.json) |
| `web/README.md` referensi backend | ✅ Sudah diperbaiki: merujuk `../backend/` sebagai monorepo |

### ⚠️ Perlu Disesuaikan

#### 1.1 — `web/.gitignore` redundan

- **Lokasi**: `web/.gitignore`
- **Masalah**: Isinya sudah di-cover root `.gitignore` (dengan prefix `web/`).
- **Dampak**: Tidak merusak, tapi menambah noise.
- **Saran**: Bisa dihapus.

#### 1.2 — CLAUDE.md masih bilang `web/` kosong

- **Lokasi**: `CLAUDE.md` baris 153
- **Kutipan**: _"`web/`/`mobile/`/`firmware/` masih folder kosong (belum di-scaffold)"_
- **Fakta**: `web/` sudah berisi Next.js app lengkap dengan 7 halaman.
- **Saran**: Update menjadi: _"`web/` sudah di-scaffold (Next.js 14, belum terintegrasi penuh ke backend); `mobile/`/`firmware/` masih kosong."_

---

## 2. Integrasi dengan Backend — Endpoint

### Konteks penting

Backend prefix: **`/api/v1`** (`settings.API_V1_PREFIX = "/api/v1"`)
Web base URL: **`http://localhost:8000/api`** (kurang `/v1`)

### Peta Endpoint Lengkap

#### Backend tersedia (yang relevan untuk web/mobile)

| # | Method | Backend Full Path | Auth | Response Schema |
|---|---|---|---|---|
| A1 | `POST` | `/api/v1/auth/register` | — | `UserOut` |
| A2 | `POST` | `/api/v1/auth/login` | — | `TokenOut` (`{access_token, token_type}`) |
| A3 | `GET` | `/api/v1/auth/me` | JWT | `UserOut` |
| A4 | `PUT` | `/api/v1/auth/me` | JWT | `UserOut` |
| A5 | `POST` | `/api/v1/auth/me/change-password` | JWT | 204 No Content |
| A6 | `POST` | `/api/v1/auth/forgot-password` | — | `{detail: "..."}` |
| A7 | `POST` | `/api/v1/auth/reset-password` | — | 204 No Content |
| K1 | `POST` | `/api/v1/kolam` | JWT | `KolamOut` |
| K2 | `GET` | `/api/v1/kolam` | JWT | `KolamOut[]` |
| K3 | `GET` | `/api/v1/kolam/{kolam_id}` | JWT | `KolamOut` |
| K4 | `PUT` | `/api/v1/kolam/{kolam_id}` | JWT | `KolamOut` |
| K5 | `GET` | `/api/v1/kolam/{kolam_id}/devices` | JWT | `DeviceOut[]` |
| K6 | `POST` | `/api/v1/kolam/{kolam_id}/devices/{device_code}` | JWT | 204 |
| R1 | `GET` | `/api/v1/readings` | JWT/API-Key | `SensorReadingOut[]` |
| Q1 | `GET` | `/api/v1/quality/latest` | JWT/API-Key | `LatestQualityOut[]` |
| Q2 | `GET` | `/api/v1/quality/predictions` | JWT/API-Key | `DevicePredictionsOut[]` |
| N1 | `GET` | `/api/v1/notifications` | JWT | `NotificationOut[]` |
| N2 | `POST` | `/api/v1/notifications/{id}/read` | JWT | 204 |
| N3 | `POST` | `/api/v1/notifications/push-tokens` | JWT | `{detail: "..."}` |

#### Web `api.ts` — perbandingan per baris

| Web `api.ts` memanggil | Resolusi URL penuh | Backend yang benar | Status |
|---|---|---|---|
| `POST /auth/login` | `…/api/auth/login` | `POST /api/v1/auth/login` | ⚠️ **Prefix `/v1` hilang** |
| `POST /auth/forgot-password` | `…/api/auth/forgot-password` | `POST /api/v1/auth/forgot-password` | ⚠️ **Prefix `/v1` hilang** |
| `POST /auth/logout` | `…/api/auth/logout` | ❌ **Tidak ada** | ❌ Endpoint fiktif |
| `GET /ponds` | `…/api/ponds` | `GET /api/v1/kolam` | ⚠️ **Path salah** (`ponds`→`kolam`) |
| `GET /ponds/:id` | `…/api/ponds/:id` | `GET /api/v1/kolam/:kolam_id` | ⚠️ **Path salah** + ID `int` bukan `string` |
| `GET /ponds/:id/readings?range=` | `…/api/ponds/:id/readings` | ❌ **Tidak ada** — harus `GET /api/v1/readings?device_id=…` | ❌ Arsitektur salah |
| `GET /ponds/:id/predictions` | `…/api/ponds/:id/predictions` | ❌ **Tidak ada** — harus `GET /api/v1/quality/predictions?device_id=…` | ❌ Arsitektur salah |
| `GET /logs` | `…/api/logs` | ❌ **Tidak ada** di backend | ❌ Endpoint fiktif |
| `GET /notifications` | `…/api/notifications` | `GET /api/v1/notifications` | ⚠️ **Prefix `/v1` hilang** |
| `GET /users/me` | `…/api/users/me` | `GET /api/v1/auth/me` | ⚠️ **Path salah** (`users/me`→`auth/me`) |
| `PUT /users/me/password` | `…/api/users/me/password` | `POST /api/v1/auth/me/change-password` | ⚠️ **Method + path salah** |

#### Ringkasan masalah endpoint

1. **`NEXT_PUBLIC_API_BASE_URL` kurang `/v1`** — harus `http://localhost:8000/api/v1`
2. **`/ponds` → `/kolam`** — backend pakai nama Bahasa Indonesia
3. **Readings & predictions per kolam tidak nested** — backend: `GET /readings?device_id=…` dan `GET /quality/predictions?device_id=…`. Frontend perlu: ambil devices dari `GET /kolam/{id}/devices`, lalu query per device.
4. **`/logs` tidak ada** — backend tidak punya endpoint log historis terpisah
5. **`/auth/logout` tidak ada** — JWT stateless, logout cukup hapus token di client
6. **`/users/me` → `/auth/me`**, ganti password = `POST /auth/me/change-password` (bukan `PUT`)

#### Endpoint backend yang belum dipakai web

| Endpoint | Kegunaan | Perlu di web? |
|---|---|---|
| `POST /auth/register` | Registrasi akun baru | ⚠️ Belum ada halaman register |
| `PUT /auth/me` | Update profil (nama) | ⚠️ Halaman profil ada tapi belum panggil ini |
| `POST /auth/reset-password` | Set password baru dari link email | ⚠️ Belum ada halaman `/reset-password` |
| `POST /kolam` | Buat kolam baru | ⚠️ Belum ada UI |
| `PUT /kolam/{id}` | Edit kolam | ⚠️ Belum ada UI |
| `GET /kolam/{id}/devices` | Topologi device | ⚠️ Belum dipanggil |
| `POST /kolam/{id}/devices/{code}` | Klaim device | ⚠️ Belum ada UI |
| `GET /quality/latest` | Status kualitas terkini | ⚠️ Belum dipanggil (data ini yang seharusnya mengisi status Pond) |
| `GET /quality/predictions` | Prediksi multi-horizon | ⚠️ Belum dipanggil (masih hardcoded) |
| `POST /notifications/{id}/read` | Tandai sudah dibaca | ⚠️ Belum ada UI |
| `POST /notifications/push-tokens` | Registrasi FCM token | ⚠️ Belum ada |

---

## 3. Perbedaan Request Body

| Web mengirim | Backend mengharapkan | Status |
|---|---|---|
| `login()` → `{ email, password }` JSON | `UserLoginIn` → `{ email, password }` | ✅ Cocok |
| `lupaSandi()` → `{ email }` | `ForgotPasswordIn` → `{ email }` | ✅ Cocok |
| `updatePassword()` → `{ oldPassword, newPassword }` | `PasswordChangeIn` → `{ old_password, new_password }` | ⚠️ **camelCase vs snake_case** |

---

## 4. Perbedaan Response / Tipe Data

### Login Response

| Web mengharapkan | Backend mengembalikan |
|---|---|
| `{ access_token, user: { id, nama, email } }` | `{ access_token, token_type }` — **tidak ada `user`** |

**Solusi**: Setelah login, panggil `GET /auth/me` untuk dapat data user.

### User

| Web `types.ts` | Backend `UserOut` | Status |
|---|---|---|
| `id: string` | `id: int` | ⚠️ Tipe beda |
| `namaLengkap` | `nama` | ⚠️ Nama beda |
| `email` | `email` | ✅ |
| `namaTambak?` | ❌ tidak ada | ⚠️ Fiktif |
| — | `role: UserRole` | ⚠️ Web tidak punya |
| — | `created_at` | ⚠️ Web tidak punya |

### Pond / Kolam

| Web `Pond` | Backend `KolamOut` | Status |
|---|---|---|
| `id: string` | `id: int` | ⚠️ Tipe beda |
| `nama` | `nama` | ✅ |
| `status: "Aman"\|"Waspada"\|"Bahaya"` | ❌ tidak ada — status ada di `quality/latest` | ⚠️ Arsitektur beda |
| `ph, suhu, salinitas` | ❌ tidak ada — data ada di `readings` | ⚠️ Arsitektur beda |
| `updatedAt` | `created_at` (semantik beda) | ⚠️ |
| — | `lokasi, is_active` | Web tidak punya |

> **Inti masalah**: Web `Pond` menggabungkan metadata kolam + sensor values + status kualitas dalam satu tipe. Backend memisahkannya: `KolamOut` (metadata), `SensorReadingOut` (data sensor), `LatestQualityOut` (status). Frontend perlu di-redesign untuk compose dari 3 sumber ini.

### SensorReading

| Web | Backend `SensorReadingOut` | Status |
|---|---|---|
| `timestamp` | `time` | ⚠️ Nama beda |
| `ph` | `ph` | ✅ |
| `suhu` | `temperature_c` | ⚠️ Nama beda |
| `salinitas` | `salinity_ppt` | ⚠️ Nama beda |
| — | `device_id, device_code` | Web tidak punya |

### Notification

| Web | Backend `NotificationOut` | Status |
|---|---|---|
| `id: string` | `id: int` | ⚠️ Tipe |
| `kolamId: string` | `kolam_id: int` | ⚠️ Case + tipe |
| `kolamNama` | ❌ tidak ada | ⚠️ Fiktif |
| `jenis: "aktual"\|"prediksi"\|"kembali_aman"` | `source: "classification"\|"prediction"` | ⚠️ Field + values beda |
| `status: "Aman"\|"Waspada"\|"Bahaya"` | `quality_category: "baik"\|"sedang"\|"buruk"` | ⚠️ **Enum beda** |
| `pesan` | `message` | ⚠️ Nama beda |
| `parameterTerkait` | ❌ tidak ada | ⚠️ Fiktif |
| `createdAt` | `created_at` | ⚠️ Case |
| — | `device_id, device_code, event_time, is_read` | Web tidak punya |

### Prediction

| Web `Prediction` | Backend `FuzzyPredictionOut` | Status |
|---|---|---|
| `parameter: "ph"\|"suhu"\|"salinitas"` | ❌ — backend prediksi aggregate `quality_score` | ⚠️ Model konseptual beda |
| `nilaiPrediksi` | `predicted_quality_score` | ⚠️ Nama + semantik beda |
| `statusPrediksi` | `predicted_category` (`"baik"/"sedang"/"buruk"`) | ⚠️ Enum beda |
| `untukWaktu` | `target_time` | ⚠️ Nama beda |
| — | `time, horizon_minutes, model_version` | Web tidak punya |

### Status Kualitas Air — Mismatch Fundamental

| Web UI label | Backend enum (`WaterQualityCategory`) |
|---|---|
| `"Aman"` | `"baik"` |
| `"Waspada"` | `"sedang"` |
| `"Bahaya"` | `"buruk"` |

Backend enum docstring baru mengkonfirmasi: _"aman/waspada/bahaya dipetakan ke baik/sedang/buruk"_ — perlu mapping layer di frontend.

### HistoryLogEntry — Tidak ada padanan di backend

`HistoryLogEntry` (id, kolamId, parameter, nilai, status, timestamp) tidak punya endpoint backend. Data harus di-compose dari `readings` + `quality/latest`, atau backend perlu endpoint baru.

---

## 5. Environment Variables

| Variabel | Root `.env.example` | Web `.env.local.example` | Status |
|---|---|---|---|
| `FRONTEND_RESET_PASSWORD_URL` | `http://localhost:3000/reset-password` | — | ⚠️ Web belum punya route `/reset-password` |
| `NEXT_PUBLIC_API_BASE_URL` | — | `http://localhost:8000/api` | ⚠️ **Kurang `/v1`** |

---

## 6. Docker / Deployment

### ❌ Belum ada service `web` di `docker-compose.yml`

Docker compose sekarang punya: `db` (TimescaleDB) dan `backend` (FastAPI). Belum ada service untuk `web`.

**Catatan baru**: docker-compose.yml sudah di-hardening (port bind `127.0.0.1`, healthcheck backend, log rotation). Saat menambah service `web`, ikuti pola yang sama:

```yaml
  web:
    build: ./web
    container_name: sismon_kepiting-web
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_BASE_URL: http://backend:8000/api/v1
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

> Perlu `Dockerfile` di `web/` terlebih dahulu. Juga perlu tentukan mode: `next start` (SSR) atau `next export` (static).

---

## 7. Temuan Tambahan

### 7.1 — `web/src/hooks/` kosong
Folder ada tapi isinya kosong.

### 7.2 — `mock-data.ts` masih dipakai langsung
Beberapa halaman (mis. `log-historis/page.tsx` baris 61) mengimpor `mockPonds` langsung untuk dropdown filter. Harus diganti data API saat integrasi.

### 7.3 — Halaman `/reset-password` belum ada
Backend punya `POST /auth/reset-password` dan `FRONTEND_RESET_PASSWORD_URL=http://localhost:3000/reset-password`. Web belum punya halaman ini.

### 7.4 — Auth guard belum ada
Tidak ada middleware Next.js yang cek token sebelum masuk `(app)/`. Siapa pun bisa akses `/dashboard` langsung.

### 7.5 — Kolam ID type mismatch
Backend `kolam_id: int`. Web pakai string (`"kolam-a"`, `"kolam-b"`) di mock data dan `useParams<{ id: string }>()`.

### 7.6 — Detail Kolam prediksi hardcoded
`kolam/[id]/page.tsx` baris 100-117 — section "Prediksi 1 jam ke depan" berisi teks statis, bukan dari API.

### 7.7 — `api.ts` header komentar masih menyebut repo terpisah
Baris 2: `// (repo backend: https://github.com/mohamadfaisalbashir/Kepiting-Zaman-Purba)` — ini monorepo, bukan repo terpisah.

### 7.8 — Error response parsing salah
`api.ts` baris 40: `body?.message` — backend FastAPI mengirim error di field `detail`, bukan `message`. Seharusnya `body?.detail`.

---

## Ringkasan Prioritas Perbaikan

| # | Item | Severity | Effort | Status |
|---|---|---|---|---|
| 1 | ~~Fix nama produk → `sismon_kepiting`~~ | — | — | ✅ Done |
| 2 | Fix `NEXT_PUBLIC_API_BASE_URL` → tambah `/v1` | 🔴 Kritis | Kecil | ❌ Belum |
| 3 | Ubah semua path di `api.ts` sesuai backend (`/kolam`, `/auth/me`, dsb) | 🔴 Kritis | Sedang | ❌ Belum |
| 4 | Update `types.ts` — field names snake_case, enum `baik/sedang/buruk`, ID `number` | 🔴 Kritis | Sedang | ❌ Belum |
| 5 | Fix error response parsing: `body?.message` → `body?.detail` | 🔴 Kritis | Kecil | ❌ Belum (NEW) |
| 6 | Redesign data fetching: `Pond` compose dari `kolam` + `quality/latest` + `readings` | 🟠 Tinggi | Besar | ❌ Belum |
| 7 | Fix login: hapus asumsi `user` dalam response, panggil `GET /auth/me` setelah simpan token | 🟠 Tinggi | Kecil | ❌ Belum |
| 8 | Fix `updatePassword` body → snake_case + method `POST` + path `/auth/me/change-password` | 🟠 Tinggi | Kecil | ❌ Belum |
| 9 | Tambah mapping layer `baik↔Aman`, `sedang↔Waspada`, `buruk↔Bahaya` | 🟠 Tinggi | Kecil | ❌ Belum |
| 10 | Tambah halaman `/reset-password` | 🟡 Sedang | Sedang | ❌ Belum |
| 11 | Tambah auth guard (middleware/redirect) | 🟡 Sedang | Sedang | ❌ Belum |
| 12 | Fix `api.ts` komentar header (repo terpisah → monorepo) | 🟢 Rendah | Kecil | ❌ Belum |
| 13 | Update CLAUDE.md status — `web/` sudah di-scaffold | 🟢 Rendah | Kecil | ❌ Belum |
| 14 | Tambah Docker service `web` + Dockerfile | 🟢 Rendah | Sedang | ❌ Belum |

---

## ❓ Pertanyaan Belum Diklarifikasi

1. **Halaman Log Historis**: Backend tidak punya endpoint `/logs`. Buat endpoint baru di backend, atau compose di frontend dari `/readings` + `/quality/latest`?
2. **Endpoint logout**: Cukup client-side saja (hapus `api.logout()` call), atau tambah token blacklist di backend?
3. **Prioritas Docker**: Dockerize `web/` sekarang, atau nanti setelah integrasi API selesai?
4. **Status kualitas air enum**: Ubah backend enum ke `Aman/Waspada/Bahaya`, atau buat mapping layer di frontend?
