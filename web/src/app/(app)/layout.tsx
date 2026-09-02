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
    if (!window.localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    setAuthorized(true);
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
      {/* Padding bawah = tinggi bar nav + safe area iPhone, jadi baris terakhir
          tiap halaman tidak tertutup bar itu. */}
      <div className="flex min-h-screen flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
