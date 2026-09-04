"use client";

import { useCallback, useEffect, useState } from "react";
import { PlugZap, Pencil, Trash2, Clock3, X } from "lucide-react";
import clsx from "clsx";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import ParameterStrip from "@/components/kolam/ParameterStrip";
import PredictionPanel from "@/components/kolam/PredictionPanel";
import HistoryChart from "@/components/kolam/HistoryChart";
import CombinedChart from "@/components/kolam/CombinedChart";
import DangerZone from "@/components/kolam/DangerZone";
import {
  Kolam,
  Device,
  SensorReading,
  LatestQuality,
  FuzzyPrediction,
  DeviceAmmonia,
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { DISCLAIMER as AMONIA_DISCLAIMER } from "@/lib/ammonia";
import { ParamKey, PARAM_KEYS, PARAM_UI } from "@/lib/parameter";
import { api } from "@/lib/api";

/**
 * Judul & catatan tiap bagian, ditulis SEKALI.
 *
 * Kerangka (DetailSkeleton) memakai `Section` dengan judul yang sama persis
 * dengan versi termuatnya — itu yang membuat tinggi kepala tiap bagian cocok
 * tanpa disetel tangan, dan itu pula yang menahan tinggi panel saat berganti
 * rak. Kalau teksnya ditulis dua kali, salah satunya pasti ketinggalan dan
 * kerangkanya pelan-pelan lepas dari tata letak yang ditirunya.
 */
const SECTION = {
  // Satu-satunya catatan yang tersisa. Angka fraksi tanpa kalimat ini gampang
  // dibaca sebagai kadar amonia terukur, yang justru TIDAK diukur sistem ini
  // (amonia.md:7).
  terkini: {
    title: "Parameter",
    note: AMONIA_DISCLAIMER,
  },
  prediksi: { title: "Prediksi 15/30/60 menit" },
  pemantauan: { title: "Grafik pemantauan" },
  gabungan: { title: "Grafik gabungan" },
  pengaturan: { title: "Pengaturan rak" },
} as const;

/**
 * Detail satu rak, terbuka INLINE di bawah kartu raknya di dashboard.
 *
 * Dulu ini halaman sendiri (/kolam/[id]). Rutenya dihapus: pindah halaman untuk
 * melihat satu rak memaksa muat ulang seluruh kerangka, dan mengembalikan
 * pengguna ke dashboard hanya untuk membuka rak berikutnya.
 *
 * SATU lembar kaca, bukan tumpukan kartu. Sebelumnya tiap bagian punya
 * pembungkus `.glass` sendiri di dalam pembungkus `.glass` panel — dan itu dua
 * masalah sekaligus: terbaca seperti komponen yang ditumpuk-tumpuk, dan setiap
 * lapisan `backdrop-filter` bersarang menambah biaya cat yang terasa saat baris
 * kartu di atasnya diseret. Di sini pemisah antar bagian cuma garis rambut dan
 * judul kecil.
 */
export default function RakDetail({
  kolam,
  onClose,
  onChanged,
}: {
  /** Datang dari daftar yang sudah dimuat dashboard — jadi judul panel langsung
   *  benar tanpa menunggu GET /kolam/:id kedua. */
  kolam: Kolam;
  onClose: () => void;
  /** Dipanggil setelah nama diubah atau rak dihapus, supaya daftar kartu di
   *  dashboard ikut segar tanpa panel ini perlu tahu cara memuatnya. */
  onChanged: () => void;
}) {
  const kolamId = kolam.id;

  // Satu rak = satu device. Backend menolak klaim kedua dengan 409.
  const [device, setDevice] = useState<Device | null>(null);
  const [quality, setQuality] = useState<LatestQuality | null>(null);
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [predictions, setPredictions] = useState<FuzzyPrediction[]>([]);
  const [ammonia, setAmmonia] = useState<DeviceAmmonia | null>(null);
  const [activeParam, setActiveParam] = useState<ParamKey>("ph");
  const [loading, setLoading] = useState(true);
  // Terpisah dari `loading`, yang cuma menutup pengambilan device. Ini yang
  // membedakan "bacaan belum sampai" dari "rak ini memang belum punya bacaan" —
  // tanpa itu bagian grafik tidak bisa memesan tempat setinggi grafiknya, dan
  // panel tumbuh sekali lagi saat data akhirnya masuk.
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [claiming, setClaiming] = useState(false);

  const [namaRak, setNamaRak] = useState(kolam.nama);
  const [savingRak, setSavingRak] = useState(false);
  const [rakMessage, setRakMessage] = useState<string | null>(null);
  // Satu state, bukan dua boolean: membuka satu panel otomatis menutup yang lain.
  const [panel, setPanel] = useState<"nama" | "hapus" | null>(null);

  const loadDevice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceList = await api.getKolamDevices(kolamId);
      setDevice(deviceList[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat device rak.");
    } finally {
      setLoading(false);
    }
  }, [kolamId]);

  // loadDevice berubah identitasnya HANYA saat kolamId berubah, jadi efek ini
  // efektif berjalan sekali per rak. Sengaja TIDAK bergantung pada kolam.nama:
  // menyimpan nama baru membuat prop itu berubah, dan efek yang ikut berjalan
  // akan menutup panel "Ubah nama rak" tepat saat pesan berhasilnya muncul.
  // Reset antar-rak sendiri sudah dijamin `key` di dashboard yang me-remount
  // komponen ini; efek ini cukup mengambil device-nya.
  useEffect(() => {
    loadDevice();
  }, [loadDevice]);

  useEffect(() => {
    if (!device) {
      setQuality(null);
      setReading(null);
      setHistory([]);
      setPredictions([]);
      setAmmonia(null);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    async function loadDeviceData(deviceId: number) {
      try {
        const [qualityList, readings, predictionList, ammoniaList] = await Promise.all([
          api.getLatestQuality(deviceId),
          api.getReadings({ device_id: deviceId, limit: 100 }),
          api.getPredictions(deviceId),
          api.getAmmoniaRisk(deviceId),
        ]);
        setQuality(qualityList[0] ?? null);
        setReading(readings[0] ?? null);
        // Backend mengurutkan terbaru dulu (time DESC); grafik perlu urutan naik
        // supaya sumbu waktu tidak terbaca mundur.
        setHistory([...readings].reverse());
        setPredictions(predictionList[0]?.predictions ?? []);
        setAmmonia(ammoniaList[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat data sensor.");
      } finally {
        // Refresh senyap tiap 60 detik ikut lewat sini, tapi tidak apa-apa:
        // efek di atas yang menyetel `true` hanya berjalan saat device berganti,
        // jadi yang dilakukan panggilan berkala cuma menyetel `false` lagi.
        setDataLoading(false);
      }
    }

    const deviceId = device.id;
    loadDeviceData(deviceId);
    // Refresh senyap — loadDeviceData tidak menyentuh state `loading`, jadi
    // baris parameter & grafik ter-update tanpa panel berkedip.
    const id = setInterval(() => loadDeviceData(deviceId), 60_000);
    return () => clearInterval(id);
  }, [device]);

  async function handleRenameRak(e: React.FormEvent) {
    e.preventDefault();
    setRakMessage(null);
    setSavingRak(true);
    try {
      await api.updateKolam(kolamId, namaRak.trim());
      setRakMessage("Nama rak berhasil diperbarui.");
      onChanged();
    } catch (err) {
      setRakMessage(err instanceof Error ? err.message : "Gagal memperbarui rak.");
    } finally {
      setSavingRak(false);
    }
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setClaiming(true);
    setError(null);
    try {
      await api.claimDevice(kolamId, deviceCode.trim());
      setDeviceCode("");
      await loadDevice();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengklaim device.");
    } finally {
      setClaiming(false);
    }
  }

  const statusLabel: StatusLabel | null = quality?.classification
    ? categoryToLabel(quality.classification.quality_category)
    : null;

  const updated = reading
    ? new Date(reading.time).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    // TANPA animate-rise di sini. Node ini di-remount tiap ganti rak (`key` di
    // dashboard), jadi animasi yang menempel padanya diputar ulang setiap kali:
    // panel setinggi layar berkedip dari opacity 0 walau tingginya sudah stabil.
    // Animasi bukanya dipindah ke pembungkus di dashboard, yang mount sekali
    // saat panel dibuka dan bertahan selama berpindah-pindah rak.
    <div className="glass overflow-hidden">
      {/* KEPALA. Sengaja TANPA foto: dashboard di atasnya sudah punya banner
          berfoto, dan hero kedua akan jadi dua foto bertumpuk di satu layar. */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700">Detail rak</p>
          {/* Nama rak buatan pengguna — panjangnya tidak terbatas, jadi dipotong
              alih-alih mendorong tombol Tutup keluar. */}
          <h2 className="mt-0.5 truncate font-display text-xl font-semibold text-ink">
            {kolam.nama}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusLabel && <StatusBadge status={statusLabel} size="sm" />}
            <DetailPill icon={PlugZap}>
              {device
                ? `Terhubung ke ${device.device_code}`
                : "Belum terhubung ke device"}
            </DetailPill>
            {updated && <DetailPill icon={Clock3}>Pembacaan terakhir {updated}</DetailPill>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail rak"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-white/70 hover:text-ink"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : (
        <>
          {error && (
            <p className="mx-5 mb-4 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya sm:mx-6">
              {error}
            </p>
          )}

          {/* Pembacaan terkini — satu baris, bukan empat kartu. */}
          <Section {...SECTION.terkini}>
            <ParameterStrip reading={reading} ammonia={ammonia?.current ?? null} />
          </Section>

          <Section {...SECTION.prediksi}>
            <PredictionPanel
              predictions={predictions}
              ammoniaForecast={ammonia?.forecast ?? []}
            />
          </Section>

          {/* Klaim device — satu rak hanya boleh satu device, jadi bagian ini
              hilang begitu raknya sudah terhubung. */}
          {!device && (
            <Section>
              <p className="mb-3 text-sm text-muted">
                Masukkan kode device yang terpasang pada rak.
              </p>
              <form
                onSubmit={handleClaim}
                className="flex flex-col gap-3 sm:max-w-md sm:flex-row sm:items-end"
              >
                <Input
                  label="Kode device"
                  placeholder="54D660E9BFB4"
                  value={deviceCode}
                  onChange={(e) => setDeviceCode(e.target.value)}
                  required
                />
                <Button type="submit" disabled={claiming}>
                  {claiming ? "Menghubungkan..." : "Hubungkan"}
                </Button>
              </form>
            </Section>
          )}

          {/* Digerbang `device`, BUKAN `history.length` — dan itu yang menahan
              tinggi panel. Digerbang panjang riwayat, kedua bagian ini absen
              selama bacaan belum sampai, lalu muncul serentak setinggi 2×256px
              dan mendorong seluruh isi halaman ke bawah. Sekarang tempatnya
              sudah dipesan sejak awal; yang berganti cuma isinya. */}
          {device && (
            <>
              <Section
                {...SECTION.pemantauan}
                aside={<ParamSwitch value={activeParam} onChange={setActiveParam} />}
              >
                {dataLoading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) : history.length > 0 ? (
                  <HistoryChart data={history} parameter={activeParam} />
                ) : (
                  <ChartEmpty />
                )}
              </Section>

              {/* Ketiga parameter sekaligus — untuk melihat apakah lonjakan satu
                  parameter berbarengan dengan yang lain. */}
              <Section {...SECTION.gabungan}>
                {dataLoading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) : history.length > 0 ? (
                  <CombinedChart data={history} />
                ) : (
                  <ChartEmpty />
                )}
              </Section>
            </>
          )}

          {/* Tindakan yang mengubah/menghapus dikumpulkan paling bawah, terpisah
              dari data. Kalau sejajar dengan grafik, tombol destruktif bersaing
              perhatian dengan angka yang justru jadi alasan panel ini dibuka. */}
          <Section {...SECTION.pengaturan}>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="ghost"
                onClick={() => setPanel((p) => (p === "nama" ? null : "nama"))}
              >
                <Pencil className="h-4 w-4" /> Ubah nama rak
              </Button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setPanel((p) => (p === "hapus" ? null : "hapus"))}
              >
                <Trash2 className="h-4 w-4" /> Hapus rak
              </button>
            </div>

            {/* Ubah identitas rak (PUT /kolam/:id) */}
            {panel === "nama" && (
              <form
                onSubmit={handleRenameRak}
                className="mt-4 flex flex-col gap-4 sm:max-w-2xl sm:flex-row sm:items-end"
              >
                <div className="sm:w-64">
                  <Input
                    label="Nama rak"
                    value={namaRak}
                    onChange={(e) => setNamaRak(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={savingRak || namaRak === kolam.nama}>
                  {savingRak ? "Menyimpan..." : "Simpan"}
                </Button>
              </form>
            )}
            {panel === "nama" && rakMessage && (
              <p className="mt-3 text-sm text-muted">{rakMessage}</p>
            )}

            {panel === "hapus" && (
              <div className="mt-4">
                <DangerZone
                  kolamId={kolamId}
                  nama={kolam.nama}
                  deviceCode={device?.device_code ?? null}
                  onDeleted={() => {
                    // Urutannya penting: tutup dulu, baru muat ulang daftar.
                    // Terbalik, panel sempat merender rak yang sudah tidak ada.
                    onClose();
                    onChanged();
                  }}
                />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/**
 * Satu bagian di dalam lembar. Pemisahnya garis rambut + judul kecil, BUKAN
 * kartu berbingkai — itulah bedanya "satu lembar informasi" dengan "tumpukan
 * komponen".
 */
function Section({
  title,
  note,
  aside,
  children,
}: {
  title?: string;
  note?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/60 px-5 py-5 sm:px-6">
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
            )}
            {note && <p className="mt-1 max-w-2xl text-xs text-muted">{note}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function DetailPill({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-inset ring-white/70">
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
      {children}
    </span>
  );
}

/**
 * Pemilih parameter grafik. Indikatornya SATU span yang bergeser, bukan latar
 * yang berpindah dari tombol ke tombol — perpindahannya jadi terbaca sebagai
 * gerakan, dan matanya ikut ke tujuan alih-alih mengedip ke sana.
 *
 * Lebar indikator dihitung dari jumlah parameter, jadi menambah parameter
 * keempat di PARAM_KEYS tidak perlu menyentuh komponen ini.
 */
function ParamSwitch({
  value,
  onChange,
}: {
  value: ParamKey;
  onChange: (p: ParamKey) => void;
}) {
  const index = PARAM_KEYS.indexOf(value);
  const pct = 100 / PARAM_KEYS.length;

  return (
    <div
      role="tablist"
      aria-label="Parameter grafik"
      className="relative flex shrink-0 rounded-lg bg-white/50 p-1 ring-1 ring-inset ring-white/70"
    >
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-md bg-white shadow-card transition-transform duration-300 ease-smooth motion-reduce:transition-none"
        style={{
          // calc: lebar track dikurangi padding 4px di kedua sisi, dibagi rata.
          width: `calc((100% - 0.5rem) / ${PARAM_KEYS.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {PARAM_KEYS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p)}
            style={{ width: `${pct}%` }}
            className={clsx(
              "relative z-10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
              active ? "" : "text-muted hover:text-ink"
            )}
          >
            {/* Warna teks aktif = warna garisnya di grafik. Kaitan tab-ke-garis
                jadi tidak perlu dihafal. */}
            <span style={active ? { color: PARAM_UI[p].color } : undefined}>
              {PARAM_UI[p].short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Kotak setinggi grafik untuk rak yang device-nya belum pernah mengirim apa
 *  pun. Tingginya sengaja sama dengan h-64 milik grafik: panel tidak boleh
 *  berubah tinggi hanya karena satu rak kebetulan masih kosong. */
function ChartEmpty() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg bg-white/40 text-sm text-muted">
      Belum ada pembacaan tersimpan untuk rak ini.
    </div>
  );
}

/**
 * Kerangka lembar.
 *
 * Menirukan SELURUH tata letak, bukan cuma dua bloknya seperti dulu, dan
 * memakai `Section` yang sama persis — bukan div dengan padding yang disalin.
 * Alasannya bukan kerapian: berganti rak me-remount panel ini lewat `key` di
 * dashboard, jadi tinggi kerangka adalah tinggi panel selama data rak baru
 * dijemput. Kerangka lama ~700px sementara isinya ~1400px, sehingga tiap
 * perpindahan rak meruntuhkan panel lalu menumbuhkannya lagi — itu yang
 * terbaca patah. Dengan `Section` dan judul yang sama, keduanya cocok dengan
 * sendirinya dan tetap cocok walau bagiannya nanti bertambah.
 *
 * Judulnya ditulis apa adanya, bukan sebagai Skeleton: teks itu statis, tidak
 * sedang dimuat, dan memakainya langsung justru yang menyamakan tinggi kepala
 * tiap bagian.
 */
function DetailSkeleton() {
  return (
    <>
      <Section {...SECTION.terkini}>
        <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-1 py-4 sm:px-5 sm:py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-8 w-24" />
              <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
              <Skeleton className="mt-1 h-2.5 w-full" />
            </div>
          ))}
        </div>
      </Section>

      <Section {...SECTION.prediksi}>
        <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-1 py-4 sm:px-5 sm:py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-0.5 w-full rounded-full" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </Section>

      <Section {...SECTION.pemantauan} aside={<Skeleton className="h-8 w-40 rounded-lg" />}>
        <Skeleton className="h-64 w-full rounded-lg" />
      </Section>

      <Section {...SECTION.gabungan}>
        <Skeleton className="h-64 w-full rounded-lg" />
      </Section>

      <Section {...SECTION.pengaturan}>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-[38px] w-36 rounded-lg" />
          <Skeleton className="h-[38px] w-28 rounded-lg" />
        </div>
      </Section>
    </>
  );
}
