import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Berkas font di repo, bukan next/font/google: yang google mengunduh font dari
// Google saat `next build`, dan di VPS balasannya memuat URL tanpa ekstensi
// sehingga build Docker gagal ("Cannot read properties of null (reading '1')").
// Subset latin JetBrains Mono (variable font) dari fonts.gstatic.com, lisensi OFL.
const jetbrains = localFont({
  src: "./fonts/JetBrainsMono-latin.woff2",
  variable: "--font-jetbrains",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KrabCare · Monitoring kualitas air budidaya kepiting",
  description:
    "Sistem monitoring kualitas air pada budidaya kepiting sistem vertikal (apartemen), multi-kolam dan multi-pengguna.",
  // Ikon ada di web/public/ (hasil favicon.io), bukan konvensi app/icon.*
  // Next: satu paket itu sudah memuat banyak ukuran, apple-touch-icon, dan
  // manifest, jadi cukup ditaut lewat metadata.
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tanpa viewportFit "cover", env(safe-area-inset-*) selalu 0 di iOS dan bar
  // navigasi bawah duduk tepat di bawah gesture bar.
  viewportFit: "cover",
  // Warna address bar browser mobile, disamakan dengan brand-500 (#19A8B2)
  // di globals.css.
  themeColor: "#19A8B2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: skrip di bawah menambah kelas `dark` sebelum
    // React hidup, jadi atribut class <html> memang boleh beda dari hasil server.
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Pasang mode gelap sebelum halaman digambar. Kalau menunggu React,
            halaman sempat tampil terang lalu berkedip jadi gelap. Pilihannya
            disimpan halaman Profil di localStorage ("tema").
            Default GELAP: kelas dipasang kecuali pengguna pernah memilih
            "terang". Pengunjung baru (localStorage kosong) langsung gelap. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("tema")!=="terang")document.documentElement.classList.add("dark")}catch(e){}',
          }}
        />
      </head>
      <body
        className={`${jetbrains.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
