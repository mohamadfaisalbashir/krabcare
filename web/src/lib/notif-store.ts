"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

/**
 * Jumlah notifikasi belum dibaca, satu salinan untuk seluruh tab.
 *
 * Pola sama persis dengan user-store.ts: Sidebar, MobileNav, dan halaman
 * Notifikasi semuanya butuh angka yang SAMA supaya badge di sidebar langsung
 * turun begitu notifikasi ditandai dibaca/dihapus di halaman, tanpa menunggu
 * polling 60 detik masing-masing komponen.
 *
 * Dibatasi 200 (batas keras backend, lihat routers/notifications.py) — kalau
 * memang ada >200 belum dibaca, badge menampilkan "200+", bukan angka pasti.
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
    // Diam saja — badge cuma tampilan sekunder, jangan sampai error di sini
    // ikut memunculkan pesan galat di layar.
  } finally {
    sedangMemuat = false;
  }
}

/** Dipanggil optimis setelah "Tandai dibaca"/hapus, supaya badge turun SEKETIKA
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

/** Label badge: "1".."200", atau "200+" kalau kebetulan pas di batas keras. */
export function formatUnreadBadge(n: number): string {
  return n >= BATAS_HITUNG ? `${BATAS_HITUNG}+` : String(n);
}
