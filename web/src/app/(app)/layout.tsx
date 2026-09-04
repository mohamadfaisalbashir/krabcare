"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Token disimpan di localStorage (bukan cookie), jadi middleware Next yang jalan
  // di server tidak bisa melihatnya. Guard-nya ditaruh di sini: satu tempat,
  // menutup semua rute di grup (app)/.
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

    // Bug: logout() navigasi penuh ke /login (window.location.href) SETELAH
    // menghapus token. Kalau abis itu user pencet tombol Back, browser
    // memulihkan halaman (mis. /dashboard) dari BFCACHE — potretan JS/DOM
    // sebelum logout, bukan mount baru — jadi efek di atas TIDAK jalan lagi
    // dan `authorized` yang sudah true sebelumnya tetap nempel, halaman
    // terproteksi sempat kelihatan lagi walau token sudah tidak ada. Baru
    // ketauan pas ADA request API berikutnya yang balas 401 (lihat
    // lib/api.ts:request) — makanya baru "keluar" setelah beberapa saat.
    // `pageshow` dengan `persisted: true` adalah satu-satunya sinyal yang
    // nembak tepat saat halaman dipulihkan dari bfcache; cek ulang token di
    // situ supaya user langsung terlempar balik ke /login tanpa jeda.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) cekToken();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  // Jangan render isi halaman sebelum token dipastikan ada — kalau tidak,
  // konten sempat berkedip muncul buat pengunjung yang belum login.
  if (!authorized) return null;

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Lebar ditentukan Sidebar sendiri — ia yang memiliki state kuncupnya.
          Kolom konten memakai flex-1, jadi otomatis melebar saat sidebar
          menguncup tanpa kelas pengimbang apa pun di sini. */}
      <Sidebar className="hidden shrink-0 lg:flex" />
      {/* Panel konten WinUI 3: lapisan putih di atas latar bernuansa, dengan
          sudut kiri-atas membulat di tempat ia bertemu panel navigasi. Sudut &
          garis itu hanya di lg: — di bawahnya sidebar tidak dirender, jadi tidak
          ada pertemuan panel yang perlu dilekukkan.
          Padding bawah = tinggi bar nav + safe area iPhone, jadi baris terakhir
          tiap halaman tidak tertutup bar itu.
          min-w-0 BUKAN hiasan: sebagai anak flex, kolom ini punya min-width:auto
          dan akan melebar mengikuti konten terlebarnya. Tanpa ini baris rak yang
          bisa digeser di dashboard justru melebarkan seluruh panel, bukan
          menggulir di dalam dirinya sendiri. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-surface pb-[calc(4rem+env(safe-area-inset-bottom))] lg:rounded-tl-xl2 lg:border-l lg:border-t lg:border-border lg:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
