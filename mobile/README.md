# KrabCare Mobile (Android)

Aplikasi Flutter dengan fitur yang sama seperti `web/`: login, daftar, lupa sandi, dashboard kolam
(parameter, prediksi, amonia, grafik), log historis beserta ekspor CSV/XLSX, notifikasi, profil,
dan halaman perangkat untuk admin. Aplikasi memakai API FastAPI yang sama, jadi backend tidak
perlu diubah.

| Berkas | Isi |
|---|---|
| `lib/api.dart` | klien API (padanan `web/src/lib/api.ts`) |
| `lib/logic.dart` | ambang parameter, format tanggal, ekspor CSV (padanan `parameter.ts`, `ammonia.ts`, `tanggal.ts`, `export.ts`) |
| `lib/ui.dart` | tema, badge status, grafik riwayat |
| `lib/main.dart` | sesi, push FCM, navigasi bawah |
| `lib/screens/*.dart` | satu berkas per halaman web |

Angka ambang di `lib/logic.dart` adalah **salinan ketiga** Tabel 2.1. Kalau diubah, ubah juga
`backend/app/core/water_thresholds.py` dan `web/src/lib/parameter.ts`.

## Menjalankan

```bash
flutter pub get
flutter test                                   # uji logic.dart (porting export.test.ts)

# Emulator ke backend Docker lokal (build debug mengizinkan HTTP polos)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1

# APK produksi, default ke https://api.krabcare.com/api/v1
flutter build apk --release
```

Hasil build ada di `build/app/outputs/flutter-apk/app-release.apk`.

## Kunci rilis (wajib dicadangkan)

APK release ditandatangani `android/app/upload-keystore.jks`, dan kata sandinya ada di
`android/key.properties`. Keduanya sengaja **tidak masuk git**. Cadangkan kedua berkas itu
di tempat aman, karena kunci yang hilang tidak bisa dibuat ulang dengan sidik jari yang sama.
Kalau kunci berganti, tautan email tidak lagi terbuka di app, dan app tidak bisa di-update di
Play Store.

Tanpa `key.properties` (misalnya build di komputer lain), build release otomatis memakai debug
key. APK tetap jadi, tapi tautan email akan terbuka di browser.

## Verifikasi email & reset sandi di dalam app (Android App Links)

Tautan di email (`https://krabcare.com/verifikasi-email?token=…` dan
`/reset-password?token=…`) langsung membuka layar yang sesuai di app. Layarnya ada di
`lib/screens/auth.dart`, penanganan tautannya di `bukaTautan` pada `lib/main.dart`. Kalau
app tidak terpasang, tautan tetap terbuka di halaman web seperti biasa.

Syaratnya, `web/public/.well-known/assetlinks.json` harus sudah ter-deploy di krabcare.com.
Berkas itu berisi sidik jari SHA-256 kunci rilis dan debug key laptop pengembang. Cek:

```bash
curl https://krabcare.com/.well-known/assetlinks.json
adb shell pm get-app-links com.krabcare.app      # krabcare.com harus "verified"
```

Uji tanpa email, misalnya dengan token yang dibuat manual di DB lokal:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "'https://krabcare.com/reset-password?token=TOKEN'" com.krabcare.app
```

## Jam

Semua jam ditampilkan dalam WIB (Asia/Jakarta), apa pun zona waktu HP. Aturan ini sama
dengan web (`web/src/lib/tanggal.ts`) dan dengan teks notifikasi dari backend.

## Mengaktifkan push notification (FCM)

Kodenya sudah terpasang. Selama berkas Firebase belum ada, aplikasi tetap berjalan normal tanpa
push, dan notifikasi tetap bisa dilihat di tab Notifikasi. Untuk mengaktifkannya:

1. Buat proyek di [Firebase Console](https://console.firebase.google.com).
2. Tambahkan aplikasi Android dengan package name **`com.krabcare.app`**. Unduh
   `google-services.json` ke `mobile/android/app/`, lalu build ulang APK. Plugin
   `com.google.gms.google-services` otomatis aktif begitu berkas itu ada.
3. Siapkan backend. Di Project settings → Service accounts → Generate new private key, simpan
   JSON-nya di VPS sebagai `./secrets/firebase.json` (folder `secrets/` sudah di-gitignore).
   `docker-compose.prod.yml` sudah me-mount folder `./secrets` ke `/run/secrets` di container
   `backend`. Set `FIREBASE_CREDENTIALS_PATH=/run/secrets/firebase.json` di `.env`, lalu
   jalankan ulang backend (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend`).

Uji tanpa backend: token FCM dicetak ke log (`FCM token: ...`) saat login. Tempel ke Firebase
Console → Messaging → *Send test message*.

Saat login, aplikasi mendaftarkan token lewat `POST /notifications/push-tokens`. Saat logout,
token FCM perangkat dihapus di sisi Firebase, jadi push untuk akun lama tidak lagi sampai ke HP
itu. Backend tidak menyediakan endpoint untuk menghapus token.
