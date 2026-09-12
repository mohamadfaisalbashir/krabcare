"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Token ada di localStorage, bukan cookie, jadi middleware Next di server
  // tidak bisa melihatnya. Guard-nya di sini, menutup semua rute grup (app)/.
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    function cekToken() {
      if (!window.localStorage.getItem("access_token")) {
        router.replace("/login");
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
    }

    cekToken();

    // Tombol Back setelah logout memulihkan halaman dari bfcache, bukan mount
    // baru, jadi efek di atas tidak jalan dan `authorized` yang sudah true
    // tetap menempel: halaman terproteksi sempat terlihat lagi sampai ada
    // request API yang balas 401. `pageshow` dengan `persisted: true` adalah
    // satu-satunya sinyal saat halaman dipulihkan dari bfcache.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) cekToken();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  // Jangan render isi halaman sebelum token dipastikan ada, supaya konten
  // tidak berkedip untuk pengunjung yang belum login.
  if (!authorized) return null;

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Lebar ditentukan Sidebar sendiri, ia yang memegang state kuncupnya.
          Kolom konten flex-1, jadi otomatis melebar saat sidebar menguncup. */}
      <Sidebar className="hidden shrink-0 lg:flex" />
      {/* Panel konten WinUI 3: lapisan putih di atas latar bernuansa, sudut
          kiri-atas membulat di tempat ia bertemu panel navigasi. Sudut dan
          garis itu hanya di lg:, di bawahnya sidebar tidak dirender.

          Padding bawah = tinggi bar nav + safe area iPhone, supaya baris
          terakhir tiap halaman tidak tertutup bar itu.

          min-w-0 wajib: sebagai anak flex, kolom ini punya min-width:auto dan
          akan melebar mengikuti konten terlebarnya, jadi tanpa ini baris rak
          yang bisa digeser justru melebarkan seluruh panel. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-surface pb-[calc(4rem+env(safe-area-inset-bottom))] lg:rounded-tl-xl2 lg:border-l lg:border-t lg:border-border lg:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
