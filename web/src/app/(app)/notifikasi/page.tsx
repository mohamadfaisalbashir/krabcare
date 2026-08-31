"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
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
        title="Notifikasi & Prediksi"
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
            <p className="p-6 text-center text-sm text-muted">Memuat notifikasi...</p>
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
