"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Waves } from "lucide-react";
import clsx from "clsx";
import AccountChip from "@/components/layout/AccountChip";
import PondCard, { PONDCARD_WIDTH } from "@/components/dashboard/PondCard";
import Rail from "@/components/dashboard/Rail";
import RakDetail from "@/components/kolam/RakDetail";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import {
  AmmoniaRisk,
  Device,
  KolamDashboard,
  LatestQuality,
  SensorReading,
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-store";

const PANEL_ID = "detail-rak";

// Label status UI dari klasifikasi fuzzy terbaru. `null` = device kolam ini belum pernah mengirim data. 
function getStatusLabel(item: KolamDashboard): StatusLabel | null {
  if (!item.quality?.classification) return null;
  return categoryToLabel(item.quality.classification.quality_category);
}

export default function DashboardPage() {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (user?.role === "admin") {
      router.replace("/perangkat");
    }
  }, [user, router]);

  const [items, setItems] = useState<KolamDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [kodeDevice, setKodeDevice] = useState("");
  const [saving, setSaving] = useState(false);

  // Rak yang detailnya sedang terbuka. null = belum ada yang dipilih, kartu tersusun grid 2 kolom
  const [selected, setSelected] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reading diambil per device, bukan sekali untuk semua. readings mengurutkan time DESC lalu memotong `limit` secara global
  const loadDashboard = useCallback(async (silent = false) => {
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
          let ammonia: AmmoniaRisk | null = null;
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
            try {
              const ammoniaList = await api.getAmmoniaRisk(devices[0].id);
              ammonia = ammoniaList[0]?.current ?? null;
            } catch {
              ammonia = null;
            }
          }

          return { kolam, devices, quality, latestReading, ammonia };
        })
      );

      setItems(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data kolam.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    // Sensor kirim jauh lebih sering daripada orang menekan reload.
    const id = setInterval(() => loadDashboard(true), 60_000);
    return () => clearInterval(id);
  }, [loadDashboard]);

  /*
  Dipanggil RakDetail tiap kali reading/kualitas/amonia selesai dimuat. 
  Kartu dan panel polling 60 detik agar waktu di kartu tidak terlihat telat dibanding di panel. 
  Angka dari panel ditempelkan langsung supaya keduanya menunjukkan reading yang sama.
  */
 
  const handleDetailData = useCallback(
    (
      kolamId: number,
      data: { reading: SensorReading | null; quality: LatestQuality | null; ammonia: AmmoniaRisk | null }
    ) => {
      setItems((prev) =>
        prev.map((item) =>
          item.kolam.id === kolamId
            ? { ...item, latestReading: data.reading, quality: data.quality, ammonia: data.ammonia }
            : item
        )
      );
    },
    []
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.kolam.id === selected) ?? null,
    [items, selected]
  );

  // menghilangkan rak dari daftar
  useEffect(() => {
    if (selected !== null && !loading && !selectedItem) setSelected(null);
  }, [selected, loading, selectedItem]);

  // Panel digulir ke layar hanya saat baru dibuka, bukan tiap ganti rak.
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = selected !== null;
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;

    if (justOpened) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // biar animasi smooth
    document
      .querySelector(`[data-pondcard="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  async function handleCreateKolam(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createKolam(nama, kodeDevice.trim());
      setNama("");
      setKodeDevice("");
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

  const variant = selected === null ? "grid" : "rail";

  // Dirakit sekali, dipakai dua tata letak (grid dan rail).
  const cards = loading ? (
    <KolamSkeleton variant={variant} />
  ) : (
    items.map((item) => (
      <PondCard
        key={item.kolam.id}
        item={item}
        variant={variant}
        selected={item.kolam.id === selected}
        panelId={PANEL_ID}
        // Menekan kartu yang sama = menutup, sesuai arah chevron-nya.
        onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
      />
    ))
  );

  return (
    // isolate: lapisan wallpaper agar tidak bocor ke sidebar
    <div className="relative isolate flex-1 lg:rounded-tl-xl2">
      {/* Wallpaper, dasar "Mica" halaman ini. Kartu di atasnya semuanya glass*/}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden lg:rounded-tl-xl2"
      >
        {/* agar tidak repaint seluruh latar tiap frame gulir sehingga kartu tidak berat saat diseret*/}
        <div className="absolute inset-0 bg-[url('/kepiting_belakang.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.80)_45%,rgba(255,255,255,0.84)_100%)]" />
        <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-brand-300/25 blur-3xl" />
        <div className="absolute -right-20 top-2/3 h-72 w-72 rounded-full bg-brass-300/20 blur-3xl" />
      </div>

      {/* Banner, mentok ke atas dan ke sidebar*/}
      <section className="relative overflow-hidden lg:rounded-tl-xl2">
        {/* Foto, scale, dan blur yang sama dengan panel kiri halaman login. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-105 bg-[url('/kepiting.png')] bg-cover bg-left blur-[2px]"
        />
        {/* Di bawah peredam: kalau di atasnya, ia menerangkan sudut kanan atas*/}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(25,168,178,0.35)_75%,rgba(122,205,210,0.25)_100%)]"
        />
        {/* 3. Peredam gelap vertikal. Bagian paling cerah di foto ini supaya teks putih*/}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,38,32,0.90)_0%,rgba(10,38,32,0.86)_42%,rgba(10,38,32,0.38)_70%,rgba(10,38,32,0)_100%)]"
        />
        {/* 4. Dasar banner meleleh ke wallpaper di baliknya. Separuh transparan, supaya wallpaper tidak tertutup tepat di tempat kartu*/}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.35)_22%,rgba(255,255,255,0)_55%)]"
        />

        <div className="relative px-5 pb-32 pt-6 sm:px-8 sm:pb-36">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brass-300">
                Monitoring kualitas air
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

          {/* Baris tersendiri, bukan di kolom kanan bersama profil Rata kanan jadi di layar lebar tetap di bawah profil. */}
          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-2 sm:justify-end">
            <SummaryPill label="Aman" value={summary.aman} tone="aman" />
            <SummaryPill label="Waspada" value={summary.waspada} tone="waspada" />
            <SummaryPill label="Bahaya" value={summary.bahaya} tone="bahaya" />
          </div>
        </div>
      </section>

      {/* Belum ada rak dipilih: grid 2 kolom yang mengisi halaman. Ada yang dipilih: menyusut jadi
          satu baris yang bisa digeser, ruang di bawahnya untuk panel detail. */}
      {variant === "grid" ? (
        <div className="relative z-10 -mt-20 px-5 sm:-mt-24 sm:px-8">
          {/* tanpa ini satu-satunya isyarat kartu bisa diklik cuma chevron kecil di
              pojoknya. Hilang begitu ada kolam terpilih. */}
          <p className="mb-3 text-sm font-semibold text-[#F5F5F5] sm:text-base">
            Pilih kartu kolam untuk membuka detailnya: parameter terkini,
            prediksi, dan grafik pemantauan.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cards}
            <TambahKolamTile variant="grid" onClick={() => setShowForm((v) => !v)} />
          </div>
        </div>
      ) : (
        // geseran seret + wheel, dan gradien tepi.
        <Rail>
          {cards}
          <TambahKolamTile variant="rail" onClick={() => setShowForm((v) => !v)} />
        </Rail>
      )}

      <div className="relative space-y-6 px-5 pb-5 pt-6 sm:px-8 sm:pb-8">
        {showForm && (
          <Card className="sm:max-w-md">
            <form onSubmit={handleCreateKolam} className="space-y-4">
              <Input
                label="Nama kolam"
                placeholder="Kolam A Rak 1"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
              {/* satu kolam = satu rak = satu device, jadi kolam tanpa device belum berfungsi.*/}
              <Input
                label="Kode device"
                placeholder="54D660E9BFB4"
                value={kodeDevice}
                onChange={(e) => setKodeDevice(e.target.value)}
                required
              />
              <p className="text-xs text-muted">
                Kode device = MAC address ESP32 tanpa titik dua, huruf besar.
                Device harus sudah didaftarkan admin dan belum diklaim kolam lain.
              </p>
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan kolam"}
              </Button>
            </form>
          </Card>
        )}

        {error && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {/* Detail rak, terbuka di bawah kartunya tanpa pindah halaman*/}
        <div ref={panelRef} id={PANEL_ID}>
          {selectedItem && (
            // Pembungkus animasi, Kalau animasinya menempel pada RakDetail yang di-remount tiap ganti rak, panelnya berkedip.
            <div className="animate-rise motion-reduce:animate-none">
              <RakDetail
                key={selectedItem.kolam.id}
                kolam={selectedItem.kolam}
                onClose={() => setSelected(null)}
                onChanged={() => loadDashboard(true)}
                onDataUpdate={handleDetailData}
              />
            </div>
          )}
        </div>

        {!loading && items.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Waves className="h-9 w-9 text-brand-300" strokeWidth={1.6} />
            <h2 className="font-display text-base font-semibold text-ink">
              Belum ada kolam
            </h2>
            <p className="max-w-sm text-sm text-muted">
              Buat kolam dulu lewat ubin <strong className="text-ink">+</strong> di
              atas, lalu klaim device (mis. <code>54D660E9BFB4</code>) di panel detail
              kolam supaya data sensornya mulai masuk.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// Ubin terakhir di daftar rak. Bergaris putus-putus supaya terbaca sebagai tempat kosong yang bisa diisi
function TambahKolamTile({
  variant,
  onClick,
}: {
  variant: "grid" | "rail";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group flex flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed border-white/70 bg-white/30 py-8 text-sm font-semibold text-[#1C6970] backdrop-blur-xl transition-colors hover:border-brand-300 hover:bg-white/55",
        variant === "rail" ? `${PONDCARD_WIDTH} shrink-0` : "w-full"
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/60 text-[#1C6970] transition-colors group-hover:bg-brand-50">
        <Plus className="h-5 w-5" strokeWidth={2.4} />
      </span>
      Tambah kolam
    </button>
  );
}

// Tiruan daftar rak: tiga kartu seukuran aslinya di wadah yang sama, supaya tata letaknya tidak melompat saat data kolam masuk
function KolamSkeleton({ variant }: { variant: "grid" | "rail" }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={clsx(
            "glass p-4",
            variant === "rail" ? `${PONDCARD_WIDTH} shrink-0` : "w-full"
          )}
        >
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

// Pil ringkasan kecil di bawah profil, di dalam banner
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
