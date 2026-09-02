"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Waves } from "lucide-react";
import AccountChip from "@/components/layout/AccountChip";
import PondCard, { PONDCARD_WIDTH } from "@/components/dashboard/PondCard";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import {
  Device,
  KolamDashboard,
  SensorReading,
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { api } from "@/lib/api";

/**
 * Label status UI dari klasifikasi fuzzy terbaru.
 * `null` = device kolam ini belum pernah mengirim data, jadi statusnya belum
 * bisa disimpulkan — sengaja TIDAK di-default ke "Waspada" supaya jumlah pada
 * ringkasan tidak menghitung kolam kosong sebagai anomali.
 */
function getStatusLabel(item: KolamDashboard): StatusLabel | null {
  if (!item.quality?.classification) return null;
  return categoryToLabel(item.quality.classification.quality_category);
}

export default function DashboardPage() {
  const [items, setItems] = useState<KolamDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [saving, setSaving] = useState(false);

  // Compose dashboard dari beberapa endpoint backend:
  // 1. GET /kolam → daftar kolam
  // 2. GET /quality/latest → kualitas terbaru semua device (DISTINCT ON per device)
  // 3. GET /kolam/:id/devices → device milik kolam
  // 4. GET /readings?device_id=&limit=1 → reading terbaru device itu
  //
  // Reading DIAMBIL PER DEVICE, bukan sekali untuk semua. Endpoint /readings
  // mengurutkan time DESC lalu memotong `limit` secara global — sekali fetch
  // membuat device yang jeda kirimnya lebih lama dari jendela itu tampak kosong
  // padahal datanya ada.
  //
  // ponytail: N+1 request (1 devices + 1 readings per kolam). Wajar untuk
  // belasan kolam; kalau jumlahnya tumbuh, minta endpoint batch ke backend.
  // `silent` dipakai refresh berkala: tanpa itu daftar kolam berkedip jadi
  // "Memuat data kolam..." tiap satu menit.
  async function loadDashboard(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [kolamList, qualityList] = await Promise.all([
        api.listKolam(),
        api.getLatestQuality(),
      ]);

      const dashboard: KolamDashboard[] = await Promise.all(
        kolamList.map(async (kolam) => {
          let devices: Device[];
          try {
            devices = await api.getKolamDevices(kolam.id);
          } catch {
            devices = [];
          }
          const deviceIds = new Set(devices.map((d) => d.id));
          const quality = qualityList.find((q) => deviceIds.has(q.device_id)) ?? null;

          let latestReading: SensorReading | null = null;
          if (devices[0]) {
            try {
              const rows = await api.getReadings({
                device_id: devices[0].id,
                limit: 1,
              });
              latestReading = rows[0] ?? null;
            } catch {
              latestReading = null;
            }
          }

          return { kolam, devices, quality, latestReading };
        })
      );

      setItems(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data kolam.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // Sensor kirim jauh lebih sering daripada orang menekan reload.
    const id = setInterval(() => loadDashboard(true), 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleCreateKolam(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createKolam(nama);
      setNama("");
      setShowForm(false);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kolam.");
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(
    () => ({
      aman: items.filter((i) => getStatusLabel(i) === "Aman").length,
      waspada: items.filter((i) => getStatusLabel(i) === "Waspada").length,
      bahaya: items.filter((i) => getStatusLabel(i) === "Bahaya").length,
    }),
    [items]
  );

  return (
    <div className="flex-1">
      {/* BANNER — mentok ke atas dan ke sidebar: pembungkusnya sengaja tanpa
          padding, dan sudut kiri-atasnya mengikuti lekuk panel konten di
          (app)/layout.tsx. Judul halaman ada di sini, jadi halaman ini TIDAK
          merender Topbar (halaman lain masih memakainya). */}
      <section className="relative overflow-hidden lg:rounded-tl-xl2">
        {/* Empat lapis, urutannya penting.

            Semua gradien ditulis sebagai nilai arbitrer, BUKAN utility
            from-. via-. to- dengan pengubah opasitas. Alasannya konkret:
            `from-hero-deep/92` tidak pernah digenerate Tailwind (hanya nilai
            yang ada di skala opasitas yang lolos, mis. /90), sehingga peredam
            gelapnya hilang diam-diam dan teks putih terdampar di atas langit
            cerah. Nilai eksplisit tidak bisa gagal seperti itu, sekaligus
            memberi kendali posisi henti yang memang dibutuhkan di sini. */}

        {/* 1. Foto — aset, scale, dan blur yang sama persis dengan panel kiri
               halaman login, supaya keduanya tidak lepas sinkron. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-105 bg-[url('/kepiting.png')] bg-cover bg-left blur-[2px]"
        />
        {/* 2. Sapuan merek — pengganti "swoosh" biru pada rujukan, memakai warna
               brand sendiri. Sengaja DI BAWAH peredam: kalau di atasnya, ia
               justru menerangkan sudut kanan atas, tepat tempat profil duduk. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(25,168,178,0.35)_75%,rgba(122,205,210,0.25)_100%)]"
        />
        {/* 3. Peredam gelap. VERTIKAL, bukan mendatar: profil akun duduk di
               kanan atas, dan gradien mendatar meninggalkan sisi itu terlalu
               terang. Dua henti pertama (0.90 & 0.86) menutup seluruh zona teks;
               angkanya diturunkan dari pengukuran kontras, bukan dikira-kira —
               langit paling cerah di foto ini butuh alpha ≥0.70 supaya teks
               putih tetap ≥4.5:1. Jangan diturunkan tanpa mengukur ulang. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,38,32,0.90)_0%,rgba(10,38,32,0.86)_42%,rgba(10,38,32,0.38)_70%,rgba(10,38,32,0)_100%)]"
        />
        {/* 4. Dasar banner meleleh jadi warna panel. Inilah yang membuat kartu
               rak bisa menindih tepi bawah: kartunya muncul dari daerah terang,
               bukan menabrak blok gelap. Berhenti di 55% supaya tidak menerangi
               zona teks di atasnya. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#FFFFFF_0%,rgba(255,255,255,0.75)_22%,rgba(255,255,255,0)_55%)]"
        />

        {/* pb di sini BERPASANGAN dengan -mt pada baris rak di bawah: selisih
            keduanya yang menentukan seberapa dalam kartu menindih banner.
            Ubah berdua, atau tindihannya bergeser. */}
        <div className="relative px-5 pb-32 pt-6 sm:px-8 sm:pb-36 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-brass-300">
                Monitoring Kualitas Air
              </p>
              <h1 className="mt-1.5 truncate font-display text-2xl font-semibold text-white sm:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-hero-soft">
                {items.length} kolam terhubung
              </p>
            </div>
            <AccountChip />
          </div>

          {/* Baris tersendiri, BUKAN di kolom kanan bersama profil: ketiga pil
              itu selebar ~300px, dan sebagai kolom kanan yang shrink-0 mereka
              memeras judul jadi "Dash…" di layar 375px. Sebagai baris sendiri
              yang rata kanan mulai sm:, hasil akhirnya tetap duduk di bawah
              profil di layar lebar — sekaligus muat di layar sempit. */}
          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-2 sm:justify-end">
            <SummaryPill label="Aman" value={summary.aman} tone="aman" />
            <SummaryPill label="Waspada" value={summary.waspada} tone="waspada" />
            <SummaryPill label="Bahaya" value={summary.bahaya} tone="bahaya" />
          </div>
        </div>
      </section>

      {/* BARIS RAK — diangkat sampai menindih banner. relative + z-10 supaya ia
          tergambar di atas lapisan gradien, bukan di baliknya. */}
      <div className="relative z-10 -mt-20 sm:-mt-24">
        {/* overflow-x-auto menahan geseran DI DALAM wadah ini; halaman sendiri
            tidak boleh ikut bisa digeser.
            py-2 wajib: begitu overflow-x bukan visible, sumbu Y ikut jadi auto
            dan bayangan kartu akan terpotong.
            px ada DI DALAM scroller, bukan di pembungkusnya — kartu pertama jadi
            sejajar konten lain, sementara kartu terakhir tetap boleh terpotong
            tepi panel seperti pada rujukan. */}
        <div className="rail flex snap-x gap-4 overflow-x-auto px-5 py-2 sm:px-8">
          {loading ? (
            <KolamSkeleton />
          ) : (
            items.map((item) => <PondCard key={item.kolam.id} item={item} />)
          )}
          <TambahKolamTile onClick={() => setShowForm((v) => !v)} />
        </div>
      </div>

      <div className="px-5 pb-5 pt-6 sm:px-8 sm:pb-8">
        {showForm && (
          <Card className="mb-6 sm:max-w-md">
            <form onSubmit={handleCreateKolam} className="space-y-4">
              <Input
                label="Nama kolam"
                placeholder="Kolam A - Rak 1"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan kolam"}
              </Button>
            </form>
          </Card>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {!loading && items.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Waves className="h-9 w-9 text-brand-300" strokeWidth={1.6} />
            <h2 className="font-display text-base font-semibold text-ink">
              Belum ada kolam
            </h2>
            <p className="max-w-sm text-sm text-muted">
              Buat kolam dulu lewat ubin <strong className="text-ink">+</strong> di
              atas, lalu klaim device (mis. <code>SLV1</code>) di halaman detail
              kolam supaya data sensornya mulai masuk.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Ubin terakhir di baris rak. Bergaris putus-putus supaya terbaca sebagai
 *  tempat kosong yang bisa diisi, bukan rak yang datanya belum masuk. */
function TambahKolamTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PONDCARD_WIDTH} group flex shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed border-border bg-surface/70 py-8 text-sm font-semibold text-muted transition-colors hover:border-brand-300 hover:bg-surface hover:text-brand-700`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-brand-600 transition-colors group-hover:bg-brand-50">
        <Plus className="h-5 w-5" strokeWidth={2.4} />
      </span>
      Tambah Kolam
    </button>
  );
}

/** Tiruan baris rak: tiga kartu selebar aslinya di dalam flex yang sama, jadi
 *  tata letaknya tidak melompat begitu data kolam masuk. */
function KolamSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${PONDCARD_WIDTH} card shrink-0 p-4`}>
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="mt-3 h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-24" />
          <Skeleton className="mt-4 h-3 w-full" />
        </div>
      ))}
    </>
  );
}

const DOT: Record<"aman" | "waspada" | "bahaya", string> = {
  aman: "bg-status-aman",
  waspada: "bg-status-waspada",
  bahaya: "bg-status-bahaya",
};

/**
 * Pil ringkasan kecil di bawah profil, di dalam banner.
 *
 * Latarnya putih transparan + cincin, bukan `status-*Bg` yang terang: tiga blok
 * pastel berjejer di atas foto akan menabrak banner alih-alih menyatu. Titik
 * berwarnanya hanya aksen — angka dan labelnya tetap tertulis, jadi maknanya
 * tidak pernah bergantung pada warna saja.
 */
function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "aman" | "waspada" | "bahaya";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {value} {label}
    </span>
  );
}
