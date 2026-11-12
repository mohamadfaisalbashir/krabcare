"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Tombol melayang "kembali ke atas", muncul setelah halaman digulir cukup
 * jauh. Dipakai halaman berdaftar panjang (Log historis, Notifikasi).
 */
export default function KeAtas() {
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    const cek = () => setTampil(window.scrollY > 600);
    window.addEventListener("scroll", cek, { passive: true });
    return () => window.removeEventListener("scroll", cek);
  }, []);

  if (!tampil) return null;

  return (
    // Di atas MobileNav (4rem + safe area) di layar sempit.
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      aria-label="Kembali ke atas"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 lg:bottom-8 lg:right-8"
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
    </button>
  );
}
