"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import Skeleton from "@/components/ui/Skeleton";
import ExportPanel from "@/components/log/ExportPanel";
import { AmmoniaRiskLog, SensorReading, Sensor, StatusLabel } from "@/lib/types";
import { PARAM_KEYS, PARAM_UI, ParamKey, statusOf, formatValue } from "@/lib/parameter";
import {
  AMONIA_UI,
  LOG_PARAM_AMONIA,
  LogParam,
  STATUS_TO_RISK,
  formatFraksi,
  riskToStatus,
} from "@/lib/ammonia";
import { dayRangeToIso } from "@/lib/export";
import { api } from "@/lib/api";
import clsx from "clsx";
import { formatWaktu } from "@/lib/tanggal";
import HourSelect from "@/components/ui/HourSelect";

const STATUS_FILTERS: Array<StatusLabel | "Semua"> = [
  "Semua",
  "Aman",
  "Waspada",
  "Bahaya",
];

/** Nilai query param `status` di backend (huruf kecil, seperti enum StatusFilter). */
const STATUS_QUERY: Record<StatusLabel, "aman" | "waspada" | "bahaya"> = {
  Aman: "aman",
  Waspada: "waspada",
  Bahaya: "bahaya",
};

/** Satu permintaan = 25 baris, diiris di database (LIMIT/OFFSET). */
const PAGE = 25;

/** Jam bulat 00-23 untuk mode "jam": dua dropdown, bukan <input type="time">
 *  bebas menit. Label pakai titik ("23.00"), bukan titik dua ala ISO. */
const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
function jamLabel(h: string): string {
  return `${h}.00`;
}

/**
 * Dua cara melihat rentang waktu log:
 * - "hari": dua <input type="date">, granularitas satu hari penuh.
 * - "jam": satu tanggal + dua jam bulat, untuk menyempitkan ke jam tertentu
 *   dalam hari itu (misal 08.00 sampai 17.00).
 */
type RangeMode = "hari" | "jam";
const RANGE_MODES: Array<{ value: RangeMode; label: string }> = [
  { value: "hari", label: "Per hari" },
  { value: "jam", label: "Per jam" },
];

/** Param aktif dari `?param=` di URL, fallback "ph" untuk nilai tak dikenal.
 *  Dipisah dari komponen karena dipakai untuk state awal sekaligus untuk
 *  sinkron balik saat URL berubah dari luar (submenu sidebar, tombol Back). */
function resolveParam(raw: string | null): LogParam {
  return raw === LOG_PARAM_AMONIA || PARAM_KEYS.includes(raw as ParamKey)
    ? (raw as LogParam)
    : "ph";
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "whitespace-nowrap rounded-full border px-2 py-1.5 text-center text-[11px] font-semibold transition sm:px-3.5 sm:text-xs",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-border text-muted hover:bg-bg"
      )}
    >
      {children}
    </button>
  );
}

export default function LogHistorisPage() {
  return (
    <>
      {/* Topbar di luar Suspense supaya fallback tidak berkedip tanpa header. */}
      <Topbar
        title="Log historis"
        subtitle="Riwayat data sensor per parameter"
      />
      <Suspense fallback={<LogRowsSkeleton />}>
        <LogHistorisView />
      </Suspense>
    </>
  );
}

function LogHistorisView() {
  const router = useRouter();

  // URL tetap sumber kebenaran untuk bookmark dan tombol Back, tapi parameter
  // yang dipakai render & fetch adalah state lokal, bukan useSearchParams()
  // langsung. Kalau menunggu navigasi Next selesai, ganti parameter terasa
  // lag. Klik men-set state dulu, URL disinkronkan belakangan lewat
  // handleParamChange().
  const rawParam = useSearchParams().get("param");
  const [param, setParam] = useState<LogParam>(() => resolveParam(rawParam));

  // Sinkron balik kalau URL berubah dari luar halaman ini (submenu sidebar,
  // tombol Back/Forward).
  useEffect(() => {
    setParam((prev) => {
      const next = resolveParam(rawParam);
      return prev === next ? prev : next;
    });
  }, [rawParam]);

  function handleParamChange(next: LogParam) {
    setParam(next);
    router.replace(`?param=${next}`, { scroll: false });
  }

  // Amonia bukan kolom sensor_readings, barisnya dari endpoint lain
  // (/quality/ammonia-risk/history), jadi halaman ini bercabang di sini.
  const isAmonia = param === LOG_PARAM_AMONIA;

  const [rows, setRows] = useState<SensorReading[]>([]);
  const [ammoniaRows, setAmmoniaRows] = useState<AmmoniaRiskLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  const [rangeMode, setRangeMode] = useState<RangeMode>("hari");
  // Kosong = semua waktu. Format "yyyy-mm-dd". Mode "hari" memakai keduanya,
  // mode "jam" cuma `dari` sebagai tanggal acuan.
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  // Mode "jam": jam mulai/selesai di dalam tanggal `dari`, jam bulat saja
  // (HOUR_OPTIONS). Default "00" dan "00" berarti satu hari penuh, lewat
  // aturan wraparound di rentangIso().
  const [jamDari, setJamDari] = useState("00");
  const [jamSampai, setJamSampai] = useState("00");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Daftar sensor diambil sekali, hanya untuk panel unduh yang butuh id device
  // dan nama kolam. Satu kolam = satu device (backend menolak klaim kedua
  // dengan 409), tapi disimpan sebagai daftar datar kalau aturan itu berubah.
  useEffect(() => {
    async function loadSensors() {
      try {
        const kolams = await api.listKolam();
        const perKolam = await Promise.all(
          kolams.map(async (k) => {
            try {
              const devices = await api.getKolamDevices(k.id);
              return devices.map((d) => ({
                deviceId: d.id,
                deviceCode: d.device_code,
                kolamNama: k.nama,
              }));
            } catch {
              // Satu kolam bermasalah tidak boleh mengosongkan seluruh daftar.
              return [];
            }
          })
        );
        setSensors(perKolam.flat());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat daftar sensor.");
      }
    }
    loadSensors();
  }, []);

  // Satu permintaan untuk seluruh halaman, bukan satu per sensor: parameter,
  // status, dan rentang waktu disaring di SQL sebelum LIMIT/OFFSET, jadi 25
  // baris yang dikirim backend adalah 25 baris yang tampil.
  //
  // device_id tidak dikirim: scope backend sudah membatasi ke device milik user,
  // dan urutan di sini kronologis, bukan "terbaru per device" seperti dashboard.
  //
  // Satu fungsi untuk kedua mode. Keduanya menghasilkan start_time/end_time ISO
  // yang sama, jadi bagian pengambilan data tidak perlu tahu mode yang aktif.
  const rentangIso = useCallback((): { start?: string; end?: string } => {
    if (rangeMode === "hari") {
      // dayRangeToIso dipakai per sisi karena ia yang menangani tengah malam
      // lokal vs UTC. Sisi yang kosong tidak dikirim.
      return {
        start: dari ? dayRangeToIso(dari, dari).start : undefined,
        end: sampai ? dayRangeToIso(sampai, sampai).end : undefined,
      };
    }
    // Mode "jam" butuh `dari` sebagai hari acuan; tanpa tanggal, "08.00 sampai
    // 17.00" tidak berarti apa-apa.
    if (!dari) return {};
    const start = new Date(`${dari}T${jamDari}:00:00`);
    let end = new Date(`${dari}T${jamSampai}:00:00`);
    // Wraparound: jam selesai <= jam mulai berarti jendelanya lewat tengah
    // malam ke hari berikutnya, bukan rentang kosong.
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [rangeMode, dari, sampai, jamDari, jamSampai]);

  const muatHalaman = useCallback(
    async (
      offset: number
    ): Promise<{ sensor: SensorReading[]; amonia: AmmoniaRiskLog[]; jumlah: number }> => {
      const rentang = rentangIso();
      const bersama = {
        limit: PAGE,
        offset,
        ...(rentang.start ? { start_time: rentang.start } : {}),
        ...(rentang.end ? { end_time: rentang.end } : {}),
      };

      if (isAmonia) {
        const halaman = await api.getAmmoniaHistory({
          ...bersama,
          // Log amonia menampilkan kondisi terukur, bukan ramalan: horizon 0 saja.
          only_measured: true,
          ...(statusFilter !== "Semua"
            ? { risk_level: STATUS_TO_RISK[statusFilter] }
            : {}),
        });
        return { sensor: [], amonia: halaman, jumlah: halaman.length };
      }

      const halaman = await api.getReadings({
        ...bersama,
        param: param as ParamKey,
        ...(statusFilter !== "Semua" ? { status: STATUS_QUERY[statusFilter] } : {}),
      });
      return { sensor: halaman, amonia: [], jumlah: halaman.length };
    },
    [param, isAmonia, statusFilter, rentangIso]
  );

  // Ganti parameter/status/rentang, kembali ke halaman pertama.
  useEffect(() => {
    let batal = false;
    setLoading(true);
    setError(null);
    muatHalaman(0)
      .then((page) => {
        if (batal) return;
        setRows(page.sensor);
        setAmmoniaRows(page.amonia);
        setHasMore(page.jumlah === PAGE);
      })
      .catch((err: unknown) => {
        if (batal) return;
        setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [muatHalaman]);

  async function handleMuatLagi() {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await muatHalaman(isAmonia ? ammoniaRows.length : rows.length);
      setRows((sebelumnya) => [...sebelumnya, ...page.sensor]);
      setAmmoniaRows((sebelumnya) => [...sebelumnya, ...page.amonia]);
      setHasMore(page.jumlah === PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
    } finally {
      setLoadingMore(false);
    }
  }

  const meta = isAmonia ? AMONIA_UI : PARAM_UI[param as ParamKey];
  const kosong = isAmonia ? ammoniaRows.length === 0 : rows.length === 0;

  return (
    <div className="flex-1 space-y-5 p-5 sm:p-8">
      <ExportPanel sensors={sensors} />

      {error && (
        <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
          {error}
        </p>
      )}

      {/* Satu panel: area kontrol dan area data menyatu, dipisah garis tipis.
          Tanpa overflow-hidden, karena outline fokus kolom tanggal dan tombol
          pil di dalamnya akan terpotong. */}
      <Card className="p-0">
        {/* Pemilih mode rentang (hari/jam), lihat RangeMode di atas. Grid 2
            kolom rata, bukan flex-wrap, supaya kedua pil sama lebar. */}
        <div className="grid grid-cols-2 gap-2 p-4 pb-0">
          {RANGE_MODES.map((m) => (
            <FilterPill
              key={m.value}
              active={rangeMode === m.value}
              onClick={() => setRangeMode(m.value)}
            >
              {m.label}
            </FilterPill>
          ))}
        </div>

        {/* Satu baris kontrol: rentang waktu di kiri, pil status di kanan.
            Di layar sempit keduanya menumpuk. */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Rentang waktu: bentuk kolomnya berubah sesuai `rangeMode`, tapi
              semuanya bermuara ke start_time/end_time lewat rentangIso().
              Kosong berarti semua waktu. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Rentang</span>
            {/* Tanpa text-xs: ukuran huruf diserahkan ke .input-field, yang 16px di
                mobile supaya Safari iOS tidak memperbesar viewport. */}
            {rangeMode === "hari" && (
              <>
                <input
                  type="date"
                  value={dari}
                  max={sampai || undefined}
                  onChange={(e) => setDari(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Tanggal mulai"
                />
                <span className="text-xs text-muted">s/d</span>
                <input
                  type="date"
                  value={sampai}
                  min={dari || undefined}
                  onChange={(e) => setSampai(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Tanggal akhir"
                />
              </>
            )}
            {rangeMode === "jam" && (
              <>
                <input
                  type="date"
                  value={dari}
                  onChange={(e) => setDari(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Tanggal"
                />
                {/* Dua HourSelect, jam bulat saja (HOUR_OPTIONS). Jam selesai boleh
                    lebih kecil atau sama dengan jam mulai: itu berarti jendela
                    melewati tengah malam, bukan kombinasi tidak valid, dan
                    ditangani rentangIso(). */}
                <HourSelect
                  value={jamDari}
                  onChange={setJamDari}
                  options={HOUR_OPTIONS}
                  format={jamLabel}
                  label="Jam mulai"
                />
                <span className="text-xs text-muted">s/d</span>
                <HourSelect
                  value={jamSampai}
                  onChange={setJamSampai}
                  options={HOUR_OPTIONS}
                  format={jamLabel}
                  label="Jam akhir"
                />
              </>
            )}
            {(dari || sampai) && (
              <button
                type="button"
                onClick={() => {
                  setDari("");
                  setSampai("");
                  setJamDari("00");
                  setJamSampai("00");
                }}
                className="py-1.5 text-xs font-semibold text-brand-600 hover:underline"
              >
                Semua waktu
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <FilterPill
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* Pemilih parameter khusus layar sempit. Di atas lg submenu sidebar
            sudah mengerjakan hal yang sama; di bawah lg sidebar tidak dirender
            dan bar bawah tidak punya submenu, jadi tanpa ini parameter terkunci
            di pH. Grid 4 kolom rata supaya keempat pil sejajar. */}
        <div className="grid grid-cols-4 gap-2 border-t border-border px-4 py-3 lg:hidden">
          {[
            ...PARAM_KEYS.map((p) => ({ value: p as LogParam, label: PARAM_UI[p].short })),
            { value: LOG_PARAM_AMONIA as LogParam, label: AMONIA_UI.short },
          ].map(({ value, label }) => (
            <FilterPill
              key={value}
              active={param === value}
              onClick={() => handleParamChange(value)}
            >
              {label}
            </FilterPill>
          ))}
        </div>

        {/* Daftar reading, satu parameter saja. Badge-nya memakai ambang yang
            sama dengan filter status di backend (app/core/water_thresholds.py),
            bukan fuzzy Mamdani: klasifikasi Mamdani ditulis jauh lebih jarang
            daripada reading, jadi status fuzzy per baris tidak ada datanya. */}
        {/* Saat parameter diganti, baris lama dibiarkan di tempatnya dan cuma
            diredupkan. Menumpuk kerangka 6 baris di atas daftar 25 baris bikin
            tingginya melompat naik lalu turun. Kerangka cuma dipakai kalau
            memang belum ada apa pun untuk ditampilkan. */}
        <div
          className={clsx(
            "divide-y divide-border border-t border-border transition-opacity duration-200 motion-reduce:transition-none",
            loading && "opacity-50"
          )}
        >
          {loading && kosong && <LogRowsSkeleton />}
          {!loading && kosong && (
            <p className="p-6 text-center text-sm text-muted">
              Tidak ada data {meta.short} untuk filter yang dipilih.
            </p>
          )}

          {/* Baris amonia: sumbernya tabel ammonia_risks, bukan sensor_readings.
              Badge-nya memakai risk_level yang tersimpan, bukan hitung ulang di
              browser, supaya log dan kartu tidak berselisih kalau ambang di
              backend diubah. */}
          {isAmonia &&
            ammoniaRows.map((r, i) => {
              const status = riskToStatus(r.risk_level);
              return (
                <div
                  key={`${r.device_code}-${r.target_time}-${r.horizon_minutes}-${i}`}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {r.device_code}{" "}
                      <span className="text-muted">
                        fraksi NH₃ toksik{" "}
                        {r.fraction_nh3_pct != null
                          ? `${formatFraksi(r.fraction_nh3_pct)}%`
                          : "N/A"}{" "}
                        dari TAN
                      </span>
                    </p>
                    {/* Cuma waktunya. Halaman ini hanya meminta baris terukur
                        (only_measured: true di muatHalaman), jadi tidak ada
                        keterangan horizon ramalan yang perlu ditampilkan. */}
                    {/* brand-700 + semibold: waktu adalah kunci baca baris log, dan
                        `muted` membuatnya terbaca paling akhir. Warna merek,
                        bukan warna status, supaya tidak tertukar dengan badge
                        di kolom sebelahnya. */}
                    <p className="text-xs font-semibold text-brand-700">
                      {formatWaktu(r.target_time)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {status && <StatusBadge status={status} size="sm" />}
                  </div>
                </div>
              );
            })}

          {!isAmonia &&
            rows.map((r, i) => {
            // Sesaat setelah parameter diganti, baris lama masih terpasang.
            // Kolom yang null harus tetap aman: formatValue() menerima number.
            const value = r[param as ParamKey] ?? null;
            return (
              <div
                key={`${r.device_code}-${r.time}-${i}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {r.device_code}{" "}
                    <span className="text-muted">
                      {meta.label} terukur {value != null ? formatValue(value) : "N/A"}
                      {/* PARAM_UI.ph.unit === "pH", jadi satuannya tidak
                          perlu diulang untuk parameter pH. */}
                      {param === "ph" || value == null ? "" : ` ${meta.unit}`}
                    </span>
                  </p>
                  <p className="text-xs font-semibold text-brand-700">
                    {formatWaktu(r.time)}
                  </p>
                </div>
                {/* Dibungkus supaya bisa shrink-0: StatusBadge tidak menerima
                    className, dan tanpa ini badge-nya kegencet di layar 375px. */}
                <div className="shrink-0">
                  {value != null && (
                    <StatusBadge status={statusOf(param as ParamKey, value)} size="sm" />
                  )}
                </div>
              </div>
            );
          })}

          {/* Tetap terpasang selama memuat, cuma dimatikan: kalau ikut hilang
              saat parameter diganti, tinggi panel menyusut lalu tumbuh lagi. */}
          {hasMore && (
            <div className="p-4 text-center">
              <Button variant="ghost" onClick={handleMuatLagi} disabled={loadingMore || loading}>
                {loadingMore ? "Memuat..." : "Muat lebih banyak"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Tiruan baris log: device + waktu di kiri, badge status di kanan. Dipakai
 *  juga sebagai fallback Suspense, jadi sama sebelum dan sesudah hydrate. */
function LogRowsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Skeleton className="h-4 w-52" />
            <Skeleton className="mt-2 h-3 w-36" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
