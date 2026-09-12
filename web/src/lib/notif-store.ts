"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

/**
 * Jumlah notifikasi belum dibaca, satu salinan untuk seluruh tab. Pola sama
 * dengan user-store.ts, supaya badge di sidebar langsung turun begitu
 * notifikasi ditandai dibaca di halaman Notifikasi.
 *
 * Dibatasi 200 (batas keras backend, routers/notifications.py); lebih dari itu
 * badge menampilkan "200+".
 */
const BATAS_HITUNG = 200;

let count: number | null = null;
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

/** Ambil ulang dari server. Dipanggil saat mount pertama & tiap 60 detik. */
export async function refreshUnreadCount(): Promise<void> {
  if (sedangMemuat) return;
  sedangMemuat = true;
  try {
    const list = await api.getNotifications({ unread_only: true, limit: BATAS_HITUNG });
    count = list.length;
    beritahu();
  } catch {
    // Diam saja. Badge cuma tampilan sekunder, error di sini tidak perlu
    // memunculkan pesan galat di layar.
  } finally {
    sedangMemuat = false;
  }
}

/** Dipanggil optimis setelah "Tandai dibaca" atau hapus, supaya badge turun
 *  tanpa menunggu polling berikutnya. */
export function setUnreadCount(next: number) {
  count = Math.max(0, next);
  beritahu();
}

export function decrementUnreadCount(by = 1) {
  if (count == null) return;
  setUnreadCount(count - by);
}

export function useUnreadCount(): number | null {
  const nilai = useSyncExternalStore(
    subscribe,
    () => count,
    () => null
  );

  useEffect(() => {
    refreshUnreadCount();
    const id = setInterval(refreshUnreadCount, 60_000);
    return () => clearInterval(id);
  }, []);

  return nilai;
}

/** Label badge: "1" sampai "200", atau "200+" kalau pas di batas keras. */
export function formatUnreadBadge(n: number): string {
  return n >= BATAS_HITUNG ? `${BATAS_HITUNG}+` : String(n);
}
