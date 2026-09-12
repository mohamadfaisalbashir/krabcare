"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import type { User } from "./types";

/**
 * Satu salinan data user untuk seluruh halaman, supaya Topbar, AccountChip,
 * dan halaman Profil tidak memanggil GET /auth/me sendiri-sendiri dan nama
 * yang baru disimpan langsung ikut berubah di header.
 *
 * useSyncExternalStore, bukan Context atau pustaka state: sudah bawaan React
 * dan modul ini satu instance per tab.
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
  // getServerSnapshot null: di server belum ada token, dan nilai yang beda
  // antara server dan hydrate memicu peringatan React.
  const nilai = useSyncExternalStore(
    subscribe,
    () => user,
    () => null
  );

  useEffect(() => {
    // Penjaga `sedangMemuat`: beberapa komponen bisa mount berbarengan dan
    // tanpa ini semuanya menembak GET /auth/me sekaligus.
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
