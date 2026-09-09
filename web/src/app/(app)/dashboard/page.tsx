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

/** id panel detail. Konstanta, bukan string yang diketik dua kali: PondCard
 *  menunjuk ke sini lewat aria-controls dan panelnya memakai id yang sama. */
const PANEL_ID = "detail-rak";

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

  // Rak yang detailnya sedang terbuka di bawah kartu. null = belum ada yang
  // dipilih, dan kartu tersusun grid 2 kolom.
  //
  // Disimpan di komponen, BUKAN di URL: yang diminta justru "tidak ganti
  // window", dan panelnya punya tombol Tutup sendiri. Menaruhnya di ?rak= cuma
  // menambah useSearchParams + router.replace untuk perilaku yang tidak dipakai.
  const [selected, setSelected] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Dipanggil RakDetail setiap kali reading/kualitas/amonia device yang lagi
  // dibuka baru dimuat (baik saat panel dibuka maupun putaran 60 detiknya
  // sendiri). Kartu kolam DAN panel detail sebelumnya polling sendiri-sendiri
  // tiap 60 detik, tapi mulai dari titik waktu yang berbeda (dashboard mulai
  // saat halaman dimuat, panel mulai saat rak dipilih) — dua jam yang tidak
  // pernah pas, itulah kenapa waktu di kartu terlihat "telat" dibanding di
  // detail. Menempelkan angka yang SAMA PERSIS ke kartu di sini, alih-alih
  // menunggu putaran polling kartu sendiri, membuat keduanya selalu
  // menunjukkan reading yang identik dan bukan cuma "sama-sama sekitar 60
  // detik terakhir".
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

  // Rak yang dipilih bisa lenyap dari daftar (dihapus, lalu refresh 60 detik
  // memuat ulang). Tanpa ini panelnya tetap terbuka menampilkan rak yang sudah
  // tidak ada.
  useEffect(() => {
    if (selected !== null && !loading && !selectedItem) setSelected(null);
  }, [selected, loading, selectedItem]);

  // Panel digulir ke layar HANYA saat baru dibuka, tidak tiap kali berpindah
  // rak: menyentak halaman setiap kali orang membandingkan dua rak justru
  // melawan tujuan "satu jendela". `justOpened` dihitung dari ref, bukan state,
  // supaya membaca nilai sebelumnya tidak ikut memicu render.
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = selected !== null;
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;

    if (justOpened) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Kartu terpilih: `nearest` + TANPA smooth, dan itu disengaja. `center`
    // yang beranimasi berarti selalu ada gulir rail yang masih berjalan setelah
    // kartu ditekan, dan gulir itu terus menimpa scrollLeft yang sedang
    // diseret pengguna — persis keluhan "berat digeser". `nearest` tidak
    // bergerak sama sekali kalau kartunya memang sudah terlihat.
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

  // Dirakit sekali, dipakai dua tata letak — kalau tidak, daftar kartunya
  // ditulis dua kali dan yang satu pasti ketinggalan saat kartunya berubah.
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
        // Menekan kartu yang sama = menutup. Chevron-nya sudah menunjuk ke
        // atas, jadi itu yang diharapkan.
        onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
      />
    ))
  );

  return (
    // isolate: lapisan wallpaper di bawah punya z-index sendiri dan tidak boleh
    // bocor ke luar halaman (sidebar & bar nav bawah ada di luar sini).
    <div className="relative isolate flex-1 lg:rounded-tl-xl2">
      {/* WALLPAPER — dasar "Mica" halaman ini. Semua kartu di atasnya adalah
          kaca (.glass), dan tanpa sesuatu yang berwarna di belakangnya, kaca
          cuma terlihat seperti kartu putih pucat.

          Cakupannya SENGAJA hanya halaman ini: sidebar dan halaman lain tetap
          solid seperti semula. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden lg:rounded-tl-xl2"
      >
        {/* Foto SENGAJA berbeda dari banner: banner memakai /kepiting.png,
            wallpaper memakai /kepiting_belakang.png. Dua foto yang sama di satu
            layar terbaca seperti aset yang lupa diganti.

            TANPA bg-fixed. `background-attachment: fixed` memang membuat foto
            diam seperti wallpaper jendela, tapi ia memaksa repaint seluruh
            latar di setiap frame gulir — itu penyebab baris kartu terasa berat
            diseret saat panel detail terbuka. Efek diamnya tidak sepadan. */}
        <div className="absolute inset-0 bg-[url('/kepiting_belakang.png')] bg-cover bg-center" />
        {/* Peredam putih. 0.80 BUKAN angka selera: kartu kaca di atasnya
            bg-white/55, jadi latar efektif kartu ≈ 91% putih — text-ink ≈ 14:1
            dan text-muted ≈ 4.9:1 (lolos AA). Menurunkannya menembus ambang
            itu. Jangan diubah tanpa mengukur ulang. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.80)_45%,rgba(255,255,255,0.84)_100%)]" />
        {/* Dua bulatan warna merek — sumber warna yang merembes lewat kaca.
            Ini yang membuat efeknya terbaca "cair", bukan sekadar tembus. */}
        <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-brand-300/25 blur-3xl" />
        <div className="absolute -right-20 top-2/3 h-72 w-72 rounded-full bg-brass-300/20 blur-3xl" />
      </div>

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
        {/* 4. Dasar banner meleleh ke wallpaper di baliknya. Dulu lapisan ini
               putih PEKAT (#FFFFFF) supaya kartu muncul dari daerah terang;
               sekarang halamannya berkaca, dan putih pekat justru menutup
               wallpaper tepat di tempat kartu duduk. Cukup separuh transparan —
               zona teks di atas tetap aman karena gradiennya berhenti di 55%. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.35)_22%,rgba(255,255,255,0)_55%)]"
        />

        {/* pb di sini BERPASANGAN dengan -mt pada daftar rak di bawah: selisih
            keduanya yang menentukan seberapa dalam kartu menindih banner.
            Ubah berdua, atau tindihannya bergeser. */}
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

      {/* KARTU RAK — dua tata letak, satu daftar.
          Belum ada rak dipilih: grid 2 kolom yang mengisi halaman, supaya
          bagian bawah tidak menganga kosong.
          Ada yang dipilih: menyusut jadi satu baris yang bisa digeser, dan
          ruang di bawahnya jadi milik panel detail. */}
      {variant === "grid" ? (
        <div className="relative z-10 -mt-20 px-5 sm:-mt-24 sm:px-8">
          {/* Petunjuk sekali di sini, bukan tooltip di tiap kartu: satu-satunya
              isyarat bahwa kartu bisa diklik selama ini cuma chevron kecil di
              pojoknya, yang tidak pernah menyebut apa yang akan terjadi.
              Hilang begitu ada kolam terpilih (variant "rail") — saat itu
              pengguna sudah membuktikan sendiri kartunya bisa diklik. */}
          <p className="mb-3 text-xs text-muted">
            Ketuk kartu kolam untuk membuka detailnya: parameter terkini,
            prediksi, dan grafik pemantauan.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cards}
            <TambahKolamTile variant="grid" onClick={() => setShowForm((v) => !v)} />
          </div>
        </div>
      ) : (
        // Rail memiliki penempatan (-mt yang menindih banner), geseran (seret +
        // wheel, tanpa scrollbar), dan gradien tepinya sendiri.
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
                placeholder="Kolam A - Rak 1"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
              {/* Device ditentukan di sini juga, bukan langkah kedua di panel
                  detail: satu kolam = satu rak = tepat satu device, jadi kolam
                  tanpa device adalah baris yang belum berfungsi. Backend
                  mengerjakan keduanya dalam SATU transaksi — kode yang salah
                  berarti kolamnya tidak jadi dibuat, bukan kolam kosong yang
                  harus dihapus manual. */}
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

        {/* DETAIL RAK — dulu halaman /kolam/[id], sekarang terbuka di sini,
            di bawah kartunya, tanpa pindah halaman. Di-key pada id rak supaya
            berganti rak me-reset seluruh state panel (grafik, form, panel
            pengaturan) alih-alih membawa sisa rak sebelumnya. */}
        <div ref={panelRef} id={PANEL_ID}>
          {selectedItem && (
            // Pembungkus animasi, SENGAJA tanpa `key`: ia mount sekali saat
            // panel dibuka dan bertahan saat pengguna melompat dari satu rak ke
            // rak lain. Kalau animasinya menempel pada RakDetail — yang memang
            // di-remount tiap ganti rak — panel setinggi layar berkedip dari
            // opacity 0 di setiap perpindahan.
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

/** Ubin terakhir di daftar rak. Bergaris putus-putus supaya terbaca sebagai
 *  tempat kosong yang bisa diisi, bukan rak yang datanya belum masuk. */
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

/** Tiruan daftar rak: tiga kartu seukuran aslinya di dalam wadah yang sama,
 *  jadi tata letaknya tidak melompat begitu data kolam masuk. */
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
