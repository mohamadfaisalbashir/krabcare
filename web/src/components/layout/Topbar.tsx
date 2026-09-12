"use client";

import AccountChip from "@/components/layout/AccountChip";

export default function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    // Tanpa border-b & backdrop-blur: header ini bagian atas panel konten yang
    // sudah putih dan tidak sticky.
    //
    // items-start + pt-6 disamakan dengan banner dashboard (dashboard/page.tsx),
    // supaya avatar tidak melompat saat berpindah halaman di layar HP.
    <header className="flex items-start justify-between px-5 pb-2 pt-6 sm:px-8">
      <div className="min-w-0">
        {/* Judul halaman detail adalah nama rak buatan pengguna, panjangnya
            tidak terbatas, jadi dipotong alih-alih mendorong avatar keluar. */}
        <h1 className="truncate font-display text-xl font-semibold text-ink sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {/* Blok profil yang sama dengan banner dashboard, cuma beda warna. */}
      <AccountChip tone="terang" />
    </header>
  );
}
