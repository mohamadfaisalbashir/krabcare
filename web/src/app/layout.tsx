import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "sismon_kepiting · Monitoring Kualitas Air Budidaya Kepiting",
  description:
    "Sistem monitoring kualitas air pada budidaya kepiting sistem vertikal (apartemen), multi-kolam dan multi-pengguna.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tanpa viewportFit "cover", env(safe-area-inset-*) selalu bernilai 0 di iOS
  // dan bar navigasi bawah duduk tepat di bawah gesture bar.
  viewportFit: "cover",
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
