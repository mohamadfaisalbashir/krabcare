"use client";

import { useEffect, useState } from "react";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { User } from "@/lib/types";

export default function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Backend TokenOut tidak membawa data user — diambil terpisah lewat GET /auth/me.
    api.getMe().then(setUser).catch(() => {});
  }, []);

  const initial = user?.nama.charAt(0).toUpperCase() ?? "…";

  return (
    // Tanpa border-b & backdrop-blur: header ini bukan bar terpisah lagi, ia
    // bagian atas panel konten yang sudah putih (dan tidak sticky, jadi blur
    // tadi memang cuma dekoratif).
    <header className="flex items-center justify-between px-5 pb-2 pt-5 sm:px-8 sm:pt-6">
      <div className="min-w-0">
        {/* Judul halaman detail adalah nama rak buatan pengguna — panjangnya
            tidak terbatas, jadi dipotong alih-alih mendorong avatar keluar. */}
        <h1 className="truncate font-display text-xl font-semibold text-ink sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          {user ? (
            <>
              <p className="text-sm font-medium text-ink">{user.nama}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </>
          ) : (
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-semibold text-white">
          {initial}
        </div>
      </div>
    </header>
  );
}
