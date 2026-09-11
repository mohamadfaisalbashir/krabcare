import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "KrabCare · Monitoring kualitas air budidaya kepiting",
  description:
    "Sistem monitoring kualitas air pada budidaya kepiting sistem vertikal (apartemen), multi-kolam dan multi-pengguna.",
  // Berkas ikonnya di web/public/ (hasil favicon.io), bukan dipindah ke
  // konvensi app/icon.* Next: satu paket ini sudah punya banyak ukuran +
  // apple-touch-icon + manifest sekaligus, cukup ditaut lewat metadata,
  // tanpa perlu Next menebak-nebak dari nama file.
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
  // Tanpa viewportFit "cover", env(safe-area-inset-*) selalu bernilai 0 di iOS
  // dan bar navigasi bawah duduk tepat di bawah gesture bar.
  viewportFit: "cover",
  // Warna address bar browser mobile saat situs dibuka, disamakan dengan
  // brand-500 (#19A8B2) di tailwind.config.ts, bukan biru/putih bawaan.
  themeColor: "#19A8B2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body
        className={`${jetbrains.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
