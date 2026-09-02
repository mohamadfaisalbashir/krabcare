"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { User } from "@/lib/types";

/**
 * Blok profil di dalam banner dashboard — versi yang bisa ditekan dari blok
 * serupa di Topbar.
 *
 * Mengambil datanya sendiri lewat GET /auth/me, pola yang sama dengan
 * Topbar.tsx: backend TokenOut tidak membawa data user. Tidak ada permintaan
 * ganda karena halaman dashboard tidak lagi merender Topbar.
 *
 * Warnanya disetel untuk latar GELAP (di atas foto banner), bukan untuk panel
 * putih seperti Topbar — itu sebabnya ia komponen terpisah dan bukan prop.
 */
export default function AccountChip() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.getMe().then(setUser).catch(() => {});
  }, []);

  const initial = user?.nama.charAt(0).toUpperCase() ?? "…";

  return (
    <Link
      href="/profil"
      // Nama & email disembunyikan di layar sempit (sama seperti Topbar), jadi
      // di sana tautan ini hanya berupa lingkaran huruf. aria-label-nya wajib,
      // bukan hiasan — tanpa itu pembaca layar cuma mendengar satu huruf.
      aria-label={user ? `Buka profil ${user.nama}` : "Buka halaman profil"}
      className="group flex shrink-0 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
    >
      <div className="hidden text-right sm:block">
        {user ? (
          <>
            <p className="text-sm font-semibold text-white">{user.nama}</p>
            <p className="text-xs text-hero-soft">{user.email}</p>
          </>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {/* Lebih terang dari Skeleton bawaan: latarnya gelap di sini. */}
            <Skeleton className="h-4 w-24 bg-white/25" />
            <Skeleton className="h-3 w-32 bg-white/20" />
          </div>
        )}
      </div>
      {/* brand-500, bukan 600: di atas latar gelap yang lebih terang justru
          lebih terbaca. Cincin putih tipis menjaganya tetap terpisah kalau
          kebetulan jatuh di bagian banner yang cerah. */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-semibold text-white ring-2 ring-white/25 transition group-hover:ring-white/50">
        {initial}
      </div>
    </Link>
  );
}
