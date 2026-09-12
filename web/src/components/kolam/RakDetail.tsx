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
  AmmoniaRisk,
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { DISCLAIMER as AMONIA_DISCLAIMER } from "@/lib/ammonia";
import { ParamKey, PARAM_KEYS, PARAM_UI } from "@/lib/parameter";
import { api } from "@/lib/api";
import { formatWaktu } from "@/lib/tanggal";

/**
 * Judul & catatan tiap bagian, ditulis sekali. DetailSkeleton memakai `Section`
 * dengan judul yang sama, jadi tinggi kepala tiap bagian cocok dengan sendirinya
 * dan panel tidak berubah tinggi saat berganti rak.
 */
const SECTION = {
  // Tanpa kalimat ini angka fraksinya gampang dibaca sebagai kadar amonia
  // terukur, padahal sistem ini tidak mengukurnya (amonia.md:7).
  terkini: {
    title: "Parameter",
    note: AMONIA_DISCLAIMER,
  },
  prediksi: { title: "Prediksi 15/30/60 menit" },
  pemantauan: {
    title: "Grafik Pemantauan",
    note: "Pita hijau adalah rentang optimal, garis putus-putus merah adalah batas toleransi. Nilai di luar garis merah masuk kategori Bahaya.",
  },
  gabungan: { title: "Grafik Gabungan" },
  pengaturan: { title: "Pengaturan Kolam" },
} as const;

/**
 * Detail satu rak, terbuka inline di bawah kartu raknya di dashboard, bukan
 * rute sendiri, supaya membuka rak lain tidak memuat ulang halaman.
 *
 * Satu pembungkus `.glass` saja, pemisah antar bagian cuma garis rambut dan
 * judul kecil: `backdrop-filter` bersarang mahal saat baris kartu diseret.
 */
export default function RakDetail({
  kolam,
  onClose,
  onChanged,
  onDataUpdate,
}: {
  /** Dari daftar yang sudah dimuat dashboard, jadi judul panel langsung benar
   *  tanpa menunggu GET /kolam/:id kedua. */
  kolam: Kolam;
  onClose: () => void;
  /** Dipanggil setelah nama diubah atau rak dihapus, supaya daftar kartu di
   *  dashboard ikut segar. */
  onChanged: () => void;
  /** Dipanggil tiap kali reading/kualitas/amonia device ini dimuat di sini.
   *  Dashboard memakainya untuk memakai angka yang sama di kartu; tanpa ini
   *  kartu punya putaran polling 60 detiknya sendiri dan waktunya terlihat
   *  mundur dibanding panel ini. */
  onDataUpdate?: (
    kolamId: number,
    // AmmoniaRisk, bukan DeviceAmmonia: bentuk yang sama dengan
    // KolamDashboard.ammonia (lib/types.ts), yaitu `current` dari DeviceAmmonia.
    data: { reading: SensorReading | null; quality: LatestQuality | null; ammonia: AmmoniaRisk | null }
  ) => void;
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
  // Terpisah dari `loading` yang cuma menutup pengambilan device. Membedakan
  // "bacaan belum sampai" dari "rak ini belum punya bacaan", supaya bagian
  // grafik bisa memesan tinggi sejak awal.
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
      setError(err instanceof Error ? err.message : "Gagal memuat device kolam.");
    } finally {
      setLoading(false);
    }
  }, [kolamId]);

  // loadDevice cuma berubah identitas saat kolamId berubah, jadi efek ini
  // berjalan sekali per rak. Tidak bergantung pada kolam.nama: menyimpan nama
  // baru akan menjalankan ulang efek dan menutup panel "Ubah nama rak" tepat
  // saat pesan berhasilnya muncul. Reset antar-rak sudah dijamin `key` di
  // dashboard.
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
        const quality = qualityList[0] ?? null;
        const reading = readings[0] ?? null;
        const ammonia = ammoniaList[0] ?? null;
        setQuality(quality);
        setReading(reading);
        // Backend mengurutkan terbaru dulu (time DESC), grafik perlu urutan naik.
        setHistory([...readings].reverse());
        setPredictions(predictionList[0]?.predictions ?? []);
        setAmmonia(ammonia);
        // Dorong angka yang sama ke kartu dashboard (lihat `onDataUpdate` di atas).
        // `.current` karena KolamDashboard.ammonia bertipe AmmoniaRisk polos.
        onDataUpdate?.(kolamId, { reading, quality, ammonia: ammonia?.current ?? null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat data sensor.");
      } finally {
        // Refresh 60 detik ikut lewat sini. Aman: efek yang menyetel `true` cuma
        // jalan saat device berganti, jadi panggilan berkala cuma menyetel `false`.
        setDataLoading(false);
      }
    }

    const deviceId = device.id;
    loadDeviceData(deviceId);
    // loadDeviceData tidak menyentuh state `loading`, jadi parameter & grafik
    // ter-update tanpa panel berkedip.
    const id = setInterval(() => loadDeviceData(deviceId), 60_000);
    return () => clearInterval(id);
  }, [device, onDataUpdate]);

  async function handleRenameRak(e: React.FormEvent) {
    e.preventDefault();
    setRakMessage(null);
    setSavingRak(true);
    try {
      await api.updateKolam(kolamId, namaRak.trim());
      setRakMessage("Nama kolam berhasil diperbarui.");
      onChanged();
    } catch (err) {
      setRakMessage(err instanceof Error ? err.message : "Gagal memperbarui kolam.");
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
    ? formatWaktu(reading.time)
    : null;

  return (
    // Tanpa animate-rise: node ini di-remount tiap ganti rak (`key` di
    // dashboard), jadi animasinya akan diputar ulang setiap kali. Animasi
    // bukanya dipasang di pembungkus dashboard yang mount sekali.
    <div className="glass overflow-hidden">
      {/* Kepala, tanpa foto: dashboard di atasnya sudah punya banner berfoto. */}
      <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#266B70]">Detail Kolam</p>
          {/* Nama rak buatan pengguna, panjangnya tidak terbatas, jadi dipotong
              alih-alih mendorong tombol Tutup keluar. */}
          {/* brand-700 (#0F7078), bukan `ink`: cukup mencolok sebagai judul panel,
              5.82:1 di atas putih, dan masih warna merek. */}
          <h2 className="mt-0.5 truncate font-display text-2xl font-semibold text-brand-700 sm:text-3xl">
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
          aria-label="Tutup detail kolam"
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

          {/* Pembacaan terkini, satu baris, bukan empat kartu. */}
          <Section {...SECTION.terkini}>
            <ParameterStrip reading={reading} ammonia={ammonia?.current ?? null} />
            {/* Keterangan pita hijau, ditaruh sekali di sini. ParameterStrip
                dirender empat kali, jadi kalimat ini akan tercetak empat kali
                kalau ditaruh di dalamnya. */}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              <span className="font-semibold text-status-aman">Angka hijau</span> di
              tengah batang adalah rentang optimal untuk kepiting bakau. Selama nilai
              parameter berada di rentang itu, lingkungan kolam sedang paling
              mendukung pertumbuhan.
            </p>
            <WarnaKondisiLegend />
          </Section>

          <Section {...SECTION.prediksi}>
            <PredictionPanel
              predictions={predictions}
              ammoniaForecast={ammonia?.forecast ?? []}
            />
            <WarnaKondisiLegend />
          </Section>

          {/* Klaim device. Satu rak cuma boleh satu device, jadi bagian ini
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

          {/* Digerbang `device`, bukan `history.length`, supaya tinggi panel
              tertahan. Kalau digerbang panjang riwayat, kedua bagian ini absen
              selama bacaan belum sampai lalu muncul serentak setinggi 2x256px
              dan mendorong isi halaman ke bawah. */}
          {device && (
            <>
              <Section
                {...SECTION.pemantauan}
                aside={<ParamSwitch value={activeParam} onChange={setActiveParam} />}
              >
                {/* Legenda warna grafik ini. Cuma satu parameter tergambar,
                    jadi satu chip cukup, tapi tanpa itu warna garisnya tidak
                    dijelaskan sama sekali. */}
                <ParamChip param={activeParam} />
                {dataLoading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) : history.length > 0 ? (
                  <HistoryChart data={history} parameter={activeParam} />
                ) : (
                  <ChartEmpty />
                )}
              </Section>

              {/* Ketiga parameter sekaligus, untuk melihat apakah lonjakan satu
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

          {/* Tindakan yang mengubah atau menghapus dikumpulkan paling bawah,
              terpisah dari data, supaya tidak bersaing perhatian dengan angka
              yang jadi alasan panel ini dibuka. */}
          <Section {...SECTION.pengaturan}>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="ghost"
                onClick={() => setPanel((p) => (p === "nama" ? null : "nama"))}
              >
                <Pencil className="h-4 w-4" /> Ubah nama kolam
              </Button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setPanel((p) => (p === "hapus" ? null : "hapus"))}
              >
                <Trash2 className="h-4 w-4" /> Hapus Kolam
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
                    label="Nama kolam"
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
                    // Tutup dulu, baru muat ulang daftar. Terbalik, panel sempat
                    // merender rak yang sudah dihapus.
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

/** Satu bagian di dalam lembar. Pemisahnya garis rambut dan judul kecil,
 *  bukan kartu berbingkai. */
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
              <h3 className="text-base font-semibold text-ink">{title}</h3>
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

/**
 * Legenda warna kondisi, dirender di dalam tiap bagian yang memakai warnanya
 * (Parameter & Prediksi), bukan sekali di kepala panel: di kepala panel
 * keterangannya sudah ter-scroll keluar layar saat pengguna sampai ke Prediksi.
 */
function WarnaKondisiLegend() {
  return (
    <div className="mt-3 flex flex-col items-start gap-1 border-t border-white/60 pt-2.5 text-xs text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
      <span className="font-medium text-ink">Warna kondisi:</span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-status-aman" />
        Aman: dalam rentang optimal
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-status-waspada" />
        Waspada: di luar optimal, masih toleransi
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-status-bahaya" />
        Bahaya: di luar rentang toleransi
      </span>
    </div>
  );
}

/** Keterangan warna garis satu parameter. Warnanya dari PARAM_UI, sumber yang
 *  sama dengan stroke grafiknya. */
function ParamChip({ param }: { param: ParamKey }) {
  const cfg = PARAM_UI[param];
  return (
    <div className="mb-2 flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{ background: cfg.color }}
      />
      <span className="font-medium text-ink">{cfg.label}</span>
      <span className="text-muted">({cfg.unit})</span>
    </div>
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
 * Pemilih parameter grafik. Indikatornya satu span yang bergeser, bukan latar
 * yang berpindah antar tombol, supaya perpindahannya terbaca sebagai gerakan.
 * Lebarnya dihitung dari jumlah parameter, jadi menambah parameter di
 * PARAM_KEYS tidak perlu menyentuh komponen ini.
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
      className="relative flex w-full shrink-0 rounded-lg bg-white/50 p-1 ring-1 ring-inset ring-white/70 sm:w-auto"
    >
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-md bg-white shadow-card transition-transform duration-300 ease-smooth motion-reduce:transition-none"
        style={{
          // Lebar track dikurangi padding 4px di kedua sisi, dibagi rata.
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
              "relative z-10 min-w-[4.75rem] whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
              active ? "" : "text-muted hover:text-ink"
            )}
          >
            {/* Warna teks aktif sama dengan warna garisnya di grafik. */}
            <span style={active ? { color: PARAM_UI[p].color } : undefined}>
              {PARAM_UI[p].short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Kotak untuk rak yang device-nya belum pernah mengirim apa pun. Tingginya
 *  h-64 sama dengan grafik, supaya panel tidak berubah tinggi. */
function ChartEmpty() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg bg-white/40 text-sm text-muted">
      Belum ada pembacaan tersimpan untuk rak ini.
    </div>
  );
}

/**
 * Kerangka lembar. Menirukan seluruh tata letak dengan `Section` yang sama,
 * karena berganti rak me-remount panel lewat `key` di dashboard dan tinggi
 * kerangka menentukan tinggi panel selama data rak baru dijemput. Kerangka
 * yang lebih pendek dari isinya bikin panel runtuh lalu tumbuh lagi.
 *
 * Judulnya ditulis apa adanya, bukan sebagai Skeleton: teksnya statis dan
 * itulah yang menyamakan tinggi kepala tiap bagian.
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
