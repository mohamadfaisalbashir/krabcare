"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import NotificationItem from "@/components/notifikasi/NotificationItem";
import { Notification } from "@/lib/types";
import { api } from "@/lib/api";

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNotifications()
      .then(setNotifications)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Gagal memuat notifikasi.")
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleRead(id: number) {
    // Optimistis: tandai lokal dulu supaya UI langsung merespons; kalau request
    // gagal, kembalikan ke belum dibaca.
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await api.markNotificationRead(id);
    } catch {
      setNotifications((list) =>
        list.map((n) => (n.id === id ? { ...n, is_read: false } : n))
      );
    }
  }

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      <Topbar
        title="Notifikasi & prediksi"
        subtitle={
          unread > 0
            ? `${unread} notifikasi belum dibaca`
            : "Riwayat peringatan kondisi aktual dan hasil prediksi kualitas air"
        }
      />

      <div className="flex-1 space-y-5 p-5 sm:p-8">
        {error && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        <Card className="p-0">
          {loading ? (
            <NotifikasiSkeleton />
          ) : notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Belum ada notifikasi.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotificationItem key={n.id} item={n} onRead={handleRead} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/** Tiruan NotificationItem: ikon bulat + dua baris teks, dibungkus divider yang sama. */
function NotifikasiSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 px-5 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-2.5 h-3 w-full max-w-md" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
