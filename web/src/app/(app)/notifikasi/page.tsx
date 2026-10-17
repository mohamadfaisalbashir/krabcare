"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Trash2 } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import NotificationItem from "@/components/notifikasi/NotificationItem";
import StatusBadge from "@/components/ui/StatusBadge";
import { Notification, NotifSource } from "@/lib/types";
import { api } from "@/lib/api";
import { refreshUnreadCount, useUnreadCount, formatUnreadBadge } from "@/lib/notif-store";

/** Satu permintaan = 20 baris, sama seperti pola "muat lebih banyak" di
 *  log-historis. Diiris di database, bukan dipotong di klien. */
const PAGE = 20;

type NotifFilter = "semua" | "kolam" | "parameter" | "prediksi";

/**
 * Filter -> nilai `source` di backend. undefined = tanpa filter.
 *
 * Harus lewat sini, bukan .filter() di klien: satu halaman cuma 20 baris, jadi
 * menyaring setelah LIMIT membuat tab tampak kosong padahal barisnya ada di
 * halaman berikutnya.
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

  // Badge sidebar & bottom-nav pakai store bersama supaya ikut turun di semua
  // tempat, bukan cuma di halaman ini (lib/notif-store.ts).
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
    // Refresh tiap 60 detik, halaman pertama saja. Notifikasi baru selalu
    // muncul di atas, dan mengganti seluruh daftar akan membuang posisi "muat
    // lebih banyak" yang sudah dijelajahi pengguna.
    const id = setInterval(() => loadPertama(true), 60_000);
    return () => {
      batal = true;
      clearInterval(id);
    };
    // muatHalaman berubah identitas tiap `filter` berganti, jadi efek ini
    // otomatis memuat ulang dari offset 0 saat ganti tab.
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
    // Optimistis: tandai lokal dulu, kembalikan ke belum dibaca kalau gagal.
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

  async function handleReadAll() {
    setError(null);
    try {
      await api.markAllNotificationsRead();
      setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
      refreshUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menandai semua notifikasi.");
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

  // Tanpa penyaringan klien: server yang menyaring (lihat FILTER_SOURCE).
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

        <PanduanBaca />

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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReadAll}
                disabled={unread === 0}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition-colors duration-150 hover:bg-bg disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.2} />
                Baca semua
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deletingAll}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-status-bahaya transition-colors duration-150 hover:bg-status-bahayaBg disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                {deletingAll ? "Menghapus..." : "Hapus semua"}
              </button>
            </div>
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

/** Chip abu-abu = jenis notifikasi; gayanya sama persis dengan di NotificationItem. */
function ChipJenis({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

/** Chip berwarna = hal yang dinilai; warnanya ikut status, seperti di NotificationItem. */
function ChipSubjek({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-status-bahayaBg px-2 py-0.5 text-[11px] font-semibold text-status-bahaya">
      {children}
    </span>
  );
}

/**
 * Panduan membaca deretan label di setiap notifikasi. <details> bawaan HTML:
 * tertutup secara default supaya tidak mendorong daftar ke bawah, bisa dibuka
 * dengan keyboard, tanpa state React. Isinya disamakan dengan panduan di
 * aplikasi mobile (mobile/lib/screens/notifikasi.dart).
 */
function PanduanBaca() {
  return (
    <details className="group rounded-xl border border-border bg-surface px-5 py-3">
      <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold text-ink">
        Cara membaca notifikasi
        <span className="text-xs font-medium text-brand-600 group-open:hidden">Tampilkan</span>
        <span className="hidden text-xs font-medium text-brand-600 group-open:inline">Sembunyikan</span>
      </summary>

      <div className="mt-3 space-y-4 text-sm leading-relaxed text-ink">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-bg px-3 py-2">
          <span className="text-sm font-semibold">54D660E9BFB4</span>
          <ChipJenis>Prediksi</ChipJenis>
          <ChipSubjek>Kualitas Kolam</ChipSubjek>
          <StatusBadge status="Bahaya" size="sm" />
        </div>
        <p className="text-muted">Label di setiap notifikasi dibaca dari kiri ke kanan:</p>

        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="font-semibold">Kode perangkat</span>, misalnya{" "}
            <span className="font-semibold">54D660E9BFB4</span>: sensor kolam yang mengirim data.
          </li>
          <li>
            <span className="font-semibold">Jenis notifikasi</span> (label abu-abu):
            <ul className="mt-1.5 space-y-1.5">
              <li>
                <ChipJenis>Kondisi aktual</ChipJenis> hasil pengukuran sensor saat ini.
              </li>
              <li>
                <ChipJenis>Parameter</ChipJenis> satu parameter (pH, suhu, salinitas, atau amonia)
                berubah status.
              </li>
              <li>
                <ChipJenis>Prediksi</ChipJenis> perkiraan kondisi 15–60 menit ke depan berdasarkan
                tren data terakhir. Belum terjadi, jadi bisa dipakai untuk berjaga-jaga.
              </li>
            </ul>
          </li>
          <li>
            <span className="font-semibold">Yang dinilai</span> (label berwarna):{" "}
            <ChipSubjek>Kualitas Kolam</ChipSubjek> berarti penilaian gabungan pH, suhu, dan
            salinitas; nama parameter (mis. <ChipSubjek>Suhu</ChipSubjek>) berarti hanya parameter
            itu. Warna labelnya mengikuti status.
          </li>
          <li>
            <span className="font-semibold">Status</span>:
            <ul className="mt-1.5 space-y-1.5">
              <li>
                <StatusBadge status="Aman" size="sm" /> kondisi berada di rentang optimal. Notifikasi
                Aman biasanya berarti kondisi sudah pulih.
              </li>
              <li>
                <StatusBadge status="Waspada" size="sm" /> mulai keluar dari rentang optimal tetapi
                masih dalam batas toleransi kepiting. Pantau kolam.
              </li>
              <li>
                <StatusBadge status="Bahaya" size="sm" /> melewati batas toleransi kepiting. Segera
                periksa kolam.
              </li>
            </ul>
          </li>
          <li>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" />{" "}
            Titik biru dan latar kebiruan berarti notifikasi belum dibaca.
          </li>
        </ol>

        <p className="text-muted">
          Contoh di atas dibaca: sensor 54D660E9BFB4 memperkirakan kualitas air kolam akan masuk
          kondisi Bahaya dalam beberapa menit ke depan.
        </p>
      </div>
    </details>
  );
}

/** Tiruan NotificationItem: ikon bulat + dua baris teks, divider yang sama. */
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
