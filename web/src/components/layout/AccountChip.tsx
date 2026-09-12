"use client";

import Link from "next/link";
import clsx from "clsx";
import Skeleton from "@/components/ui/Skeleton";
import { useUser } from "@/lib/user-store";

/**
 * Blok profil yang bisa ditekan: nama + email + lingkaran inisial.
 *
 * Satu komponen untuk dua latar (banner dashboard dan Topbar). `tone` cuma
 * mengganti warnanya; geometri dan jaraknya dipakai bersama supaya posisi
 * lingkarannya tidak berbeda antar halaman di layar sempit.
 */
export default function AccountChip({
  tone = "gelap",
}: {
  /** "gelap" = di atas foto banner dashboard, "terang" = di atas panel putih. */
  tone?: "gelap" | "terang";
}) {
  const user = useUser();
  const initial = user?.nama.charAt(0).toUpperCase() ?? "…";
  const gelap = tone === "gelap";

  return (
    <Link
      href="/profil"
      // Di layar sempit nama & email disembunyikan dan tautan ini cuma berupa
      // lingkaran huruf, jadi aria-label wajib.
      aria-label={user ? `Buka profil ${user.nama}` : "Buka halaman profil"}
      className={clsx(
        "group flex shrink-0 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
        gelap ? "hover:bg-white/10" : "hover:bg-bg"
      )}
    >
      <div className="hidden text-right sm:block">
        {user ? (
          <>
            <p
              className={clsx(
                "text-sm font-semibold",
                gelap ? "text-white" : "text-ink"
              )}
            >
              {user.nama}
            </p>
            <p className={clsx("text-xs", gelap ? "text-hero-soft" : "text-muted")}>
              {user.email}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {/* Lebih terang dari Skeleton bawaan kalau latarnya gelap. */}
            <Skeleton className={clsx("h-4 w-24", gelap && "bg-white/25")} />
            <Skeleton className={clsx("h-3 w-32", gelap && "bg-white/20")} />
          </div>
        )}
      </div>
      {/* Di atas latar gelap: brand-500 plus cincin putih tipis supaya tetap
          terpisah kalau jatuh di bagian banner yang cerah. Di atas panel putih:
          brand-600, karena teks putih di atas brand-500 cuma 2.88:1. */}
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold text-white transition",
          gelap
            ? "bg-brand-500 ring-2 ring-white/25 group-hover:ring-white/50"
            : "bg-brand-600 ring-2 ring-transparent group-hover:ring-brand-300"
        )}
      >
        {initial}
      </div>
    </Link>
  );
}
