"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import type { User } from "./types";

/**
 * Satu salinan data user untuk seluruh halaman.
 *
 * Sebelumnya Topbar, AccountChip, dan halaman Profil masing-masing memanggil
 * GET /auth/me sendiri dan menyimpannya di state lokal. Akibatnya menyimpan nama
 * baru cuma memperbarui kartu di halaman Profil, sementara header dua baris di
 * atasnya masih menampilkan nama lama sampai halaman dimuat ulang.
 *
 * Bukan Context, bukan pustaka state: useSyncExternalStore sudah bawaan React,
 * dan sebuah modul memang satu-satunya instance per tab. Yang dibutuhkan cuma
 * "satu nilai + beri tahu yang mendengarkan".
 */
let user: User | null = null;
let sedangMemuat = false;
const pendengar = new Set<() => void>();

function beritahu() {
  pendengar.forEach((f) => f());
}

function subscribe(f: () => void) {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
}

/** Dipanggil setelah PUT /auth/me supaya header ikut berubah tanpa reload. */
export function setUser(next: User | null) {
  user = next;
  beritahu();
}

export function useUser(): User | null {
  // getServerSnapshot mengembalikan null: di server memang belum ada tokennya,
  // dan nilai yang beda antara server & hydrate akan memicu peringatan React.
  const nilai = useSyncExternalStore(
    subscribe,
    () => user,
    () => null
  );

  useEffect(() => {
    // Penjaga `sedangMemuat`: tiga komponen bisa mount berbarengan, dan tanpa
    // ini ketiganya menembak GET /auth/me sekaligus — persis pemborosan yang
    // ingin dihilangkan berkas ini.
    if (user !== null || sedangMemuat) return;
    sedangMemuat = true;
    api
      .getMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => {
        sedangMemuat = false;
      });
  }, []);

  return nilai;
}
