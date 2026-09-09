"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import NotificationItem from "@/components/notifikasi/NotificationItem";
import { Notification, NotifSource } from "@/lib/types";
import { api } from "@/lib/api";
import { refreshUnreadCount, useUnreadCount, formatUnreadBadge } from "@/lib/notif-store";

/** Satu permintaan = 20 baris, sama seperti pola "muat lebih banyak" di
 *  log-historis (limit/offset diiris di database, bukan dipotong di klien). */
const PAGE = 20;

type NotifFilter = "semua" | "kolam" | "parameter" | "prediksi";

/**
 * Filter -> nilai `source` di backend. undefined = tanpa filter.
 *
 * Penyaringannya WAJIB lewat sini, bukan .filter() di klien. Satu halaman cuma
 * 20 baris: menyaring sisa halaman yang sudah dipotong LIMIT membuat tab
 * "Parameter" tampak kosong padahal barisnya ada di halaman berikutnya, dan
 * "Muat lebih banyak" pun tetap mengambil halaman yang tidak tersaring, jadi
 * datanya terlihat seperti tidak pernah tersimpan.
 */
const FILTER_SOURCE: Record<NotifFilter, NotifSource | undefined> = {
  semua: undefined,
  kolam: "classification",
  parameter: "parameter",
  prediksi: "prediction",
};

const FILTER_BUTTONS: { id: NotifFilter; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "kolam", label: "Kualitas Kolam" },
  { id: "parameter", label: "Parameter" },
  { id: "prediksi", label: "Prediksi" },
];

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotifFilter>("semua");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Badge sidebar/bottom-nav pakai store bersama supaya turun SEKETIKA di
  // semua tempat, bukan cuma di halaman ini, lihat lib/notif-store.ts.
  const unread = useUnreadCount();

  const muatHalaman = useCallback(
    (offset: number) =>
      api.getNotifications({ limit: PAGE, offset, source: FILTER_SOURCE[filter] }),
    [filter]
  );

  useEffect(() => {
    let batal = false;

    function loadPertama(silent = false) {
      if (!silent) setLoading(true);
      return muatHalaman(0)
        .then((page) => {
          if (batal) return;
          setNotifications(page);
          setHasMore(page.length === PAGE);
        })
        .catch((err: unknown) => {
          if (batal) return;
          setError(err instanceof Error ? err.message : "Gagal memuat notifikasi.");
        })
        .finally(() => {
          if (!batal) setLoading(false);
        });
    }

    loadPertama();
    // Refresh senyap tiap 60 detik, sama seperti dashboard, notifikasi baru
    // muncul tanpa reload manual. Sengaja memuat ulang HALAMAN PERTAMA saja
    // (bukan seluruh yang sudah di-scroll): notifikasi baru selalu muncul di
    // atas, dan mengganti seluruh daftar tiap menit akan membuang posisi
    // "muat lebih banyak" yang sudah dijelajahi pengguna.
    const id = setInterval(() => loadPertama(true), 60_000);
    return () => {
      batal = true;
      clearInterval(id);
    };
    // muatHalaman ikut berubah tiap `filter` berganti, jadi efek ini otomatis
    // memuat ulang dari offset 0, persis yang dibutuhkan saat ganti tab.
  }, [muatHalaman]);

  async function handleMuatLagi() {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await muatHalaman(notifications.length);
      setNotifications((sebelumnya) => [...sebelumnya, ...page]);
      setHasMore(page.length === PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat notifikasi.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRead(id: number) {
    // Optimistis: tandai lokal dulu supaya UI langsung merespons. Kalau request
    // gagal, kembalikan ke belum dibaca.
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await api.markNotificationRead(id);
      refreshUnreadCount();
    } catch {
      setNotifications((list) =>
        list.map((n) => (n.id === id ? { ...n, is_read: false } : n))
      );
    }
  }

  async function handleDelete(id: number) {
    // Simpan salinan supaya bisa dikembalikan kalau permintaan hapus gagal.
    const sebelumnya = notifications;
    setNotifications((list) => list.filter((n) => n.id !== id));
    try {
      await api.deleteNotification(id);
      refreshUnreadCount();
    } catch (err) {
      setNotifications(sebelumnya);
      setError(err instanceof Error ? err.message : "Gagal menghapus notifikasi.");
    }
  }

  async function handleDeleteAll() {
    if (notifications.length === 0) return;
    if (!window.confirm("Hapus SEMUA notifikasi? Tindakan ini tidak bisa dibatalkan.")) {
      return;
    }
    setDeletingAll(true);
    setError(null);
    try {
      await api.deleteAllNotifications();
      setNotifications([]);
      setHasMore(false);
      refreshUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus semua notifikasi.");
    } finally {
      setDeletingAll(false);
    }
  }

  // Tanpa penyaringan klien: `notifications` sudah berisi persis satu source
  // karena servernya yang menyaring (lihat FILTER_SOURCE).
  const filteredNotifications = notifications;

  return (
    <>
      <Topbar
        title="Notifikasi"
        subtitle={
          unread
            ? `${formatUnreadBadge(unread)} notifikasi belum dibaca`
            : "Riwayat peringatan kondisi aktual dan hasil prediksi kualitas air"
        }
      />

      <div className="flex-1 space-y-5 p-5 sm:p-8">
        {error && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {/* Filter bar & aksi hapus semua */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_BUTTONS.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === btn.id
                    ? "bg-brand-600 text-white shadow-sm"
                    : "border border-border bg-surface text-muted hover:bg-bg hover:text-ink"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {!loading && notifications.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-status-bahaya transition-colors duration-150 hover:bg-status-bahayaBg disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
              {deletingAll ? "Menghapus..." : "Hapus semua"}
            </button>
          )}
        </div>

        <Card className="p-0">
          {loading ? (
            <NotifikasiSkeleton />
          ) : notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Belum ada notifikasi.
            </p>
          ) : filteredNotifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Tidak ada notifikasi untuk kategori ini.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map((n) => (
                <NotificationItem key={n.id} item={n} onRead={handleRead} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="border-t border-border p-4 text-center">
              <Button variant="ghost" onClick={handleMuatLagi} disabled={loadingMore || loading}>
                {loadingMore ? "Memuat..." : "Muat lebih banyak"}
              </Button>
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
