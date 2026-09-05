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

/** Jam bulat 00-23 untuk mode "jam" -- dua dropdown, bukan <input type="time">
 *  bebas menit. Label pakai titik ("23.00") meniru notasi jam yang biasa
 *  dipakai di sini, bukan titik dua ala ISO. */
const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
function jamLabel(h: string): string {
  return `${h}.00`;
}

/**
 * Tiga cara melihat rentang waktu log:
 * - "hari": dua <input type="date">, granularitas satu hari penuh (perilaku lama).
 * - "jam": satu tanggal + dua <input type="time">, untuk menyempitkan ke jam
 *   tertentu DALAM satu hari itu (mis. cuma jam kerja 08.00-17.00).
 * - "gabungan": dua <input type="datetime-local"> bebas, tanggal DAN jam
 *   sekaligus, bisa melintasi banyak hari — dipakai kalau dua mode di atas
 *   kurang presisi.
 */
type RangeMode = "hari" | "jam" | "gabungan";
const RANGE_MODES: Array<{ value: RangeMode; label: string }> = [
  { value: "hari", label: "Per hari" },
  { value: "jam", label: "Per jam" },
  { value: "gabungan", label: "Gabungan" },
];

/** Param aktif dari `?param=` URL, dengan fallback "ph" untuk nilai yang tidak
 *  dikenal -- dipisah dari komponen supaya dipakai baik untuk state awal
 *  maupun untuk menyinkronkan balik saat URL berubah dari LUAR (link sidebar
 *  desktop, tombol Back), lihat komentar di `param`/`useEffect` di bawah. */
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

  // URL tetap sumber kebenaran untuk di-bookmark/tombol Back, TAPI parameter
  // aktif yang dipakai render & fetch adalah STATE LOKAL, bukan langsung dari
  // useSearchParams(). Sebelumnya klik pil parameter cuma router.replace(...),
  // dan `param` menunggu Next.js selesai memutar navigasinya dulu sebelum
  // pil aktif & data ikut berganti -- itu jeda yang terasa sebagai "lag"
  // tiap pindah pH -> Suhu dkk, padahal pil status/rentang waktu di sebelahnya
  // (state lokal murni) terasa instan. Klik di sini sekarang men-set state
  // dulu (instan, memicu render & fetch di render yang sama), baru
  // menyinkronkan URL di belakang layar lewat handleParamChange() di bawah.
  const rawParam = useSearchParams().get("param");
  const [param, setParam] = useState<LogParam>(() => resolveParam(rawParam));

  // Sinkron BALIK kalau URL berubah dari luar klik pil di halaman ini sendiri
  // (tautan submenu sidebar di layar lg:, tombol Back/Forward browser).
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

  // Amonia bukan kolom di sensor_readings — barisnya datang dari endpoint lain
  // (/quality/ammonia-risk/history), jadi seluruh halaman bercabang di sini.
  const isAmonia = param === LOG_PARAM_AMONIA;

  const [rows, setRows] = useState<SensorReading[]>([]);
  const [ammoniaRows, setAmmoniaRows] = useState<AmmoniaRiskLog[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  const [rangeMode, setRangeMode] = useState<RangeMode>("hari");
  // Kosong = semua waktu. Format <input type="date">: "yyyy-mm-dd". Dipakai
  // mode "hari" (dua-duanya) dan mode "jam" (cuma `dari`, sebagai tanggalnya).
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  // Mode "jam": jam mulai/selesai DALAM tanggal `dari`, jam BULAT saja ("00".."23")
  // lewat dropdown -- lihat HOUR_OPTIONS. Default "00" & "00" = satu hari penuh
  // (aturan wraparound di rentangIso() membuat selesai<=mulai berarti hari
  // berikutnya), padanan default lama "00:00"-"23:59".
  const [jamDari, setJamDari] = useState("00");
  const [jamSampai, setJamSampai] = useState("00");
  // Mode "gabungan": tanggal+jam bebas di kedua sisi. Format <input type="datetime-local">.
  const [datetimeDari, setDatetimeDari] = useState("");
  const [datetimeSampai, setDatetimeSampai] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Daftar sensor: sekali saja, dan hanya untuk panel unduh, yang butuh id
  // device serta nama kolam untuk kolom CSV. Daftar log sendiri tidak menyaring
  // per sensor. Satu kolam = tepat satu device (backend menolak klaim kedua
  // dengan 409), tapi disimpan sebagai daftar datar supaya tetap benar kalau
  // aturan itu berubah.
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
  // status, dan rentang waktu semuanya disaring di SQL sebelum LIMIT/OFFSET,
  // jadi 25 baris yang dikirim backend adalah 25 baris yang tampil.
  //
  // device_id sengaja TIDAK dikirim: scope backend sudah membatasi ke device
  // milik user. Kekhawatiran lama (sensor cerewet menenggelamkan yang jarang
  // lapor) berlaku untuk pengambilan "terbaru per device" seperti di dashboard;
  // di sini urutannya memang kronologis dan riwayat yang lebih tua tinggal
  // diminta halaman berikutnya.
  // Satu fungsi, dicabangkan per mode -- ketiganya cuma menghasilkan bentuk
  // start_time/end_time ISO yang sama untuk dikirim ke backend, jadi bagian
  // pengambilan data di bawah tidak perlu tahu mode mana yang sedang aktif.
  const rentangIso = useCallback((): { start?: string; end?: string } => {
    if (rangeMode === "hari") {
      // dayRangeToIso dipakai per sisi: ia yang menangani jebakan
      // tengah-malam-LOKAL vs UTC. Sisi yang kosong tidak dikirim sama sekali.
      return {
        start: dari ? dayRangeToIso(dari, dari).start : undefined,
        end: sampai ? dayRangeToIso(sampai, sampai).end : undefined,
      };
    }
    if (rangeMode === "jam") {
      // Tanpa tanggal, "jam 08.00-17.00" tidak berarti apa-apa -- butuh `dari`
      // sebagai hari acuannya.
      if (!dari) return {};
      const start = new Date(`${dari}T${jamDari}:00:00`);
      let end = new Date(`${dari}T${jamSampai}:00:00`);
      // Wraparound: jam selesai <= jam mulai berarti jendelanya melewati
      // tengah malam ke hari berikutnya (mis. mulai 23.00 selesai 00.00 =
      // satu jam semalam), BUKAN rentang kosong/terbalik.
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      }
      return { start: start.toISOString(), end: end.toISOString() };
    }
    // "gabungan": datetime-local sudah membawa tanggal & jam sekaligus, apa
    // adanya sebagai waktu LOKAL (perilaku bawaan `new Date(...)` untuk string
    // tanpa zona, sama seperti trik `T00:00:00` di dayRangeToIso).
    return {
      start: datetimeDari ? new Date(datetimeDari).toISOString() : undefined,
      end: datetimeSampai ? new Date(datetimeSampai).toISOString() : undefined,
    };
  }, [rangeMode, dari, sampai, jamDari, jamSampai, datetimeDari, datetimeSampai]);

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
          // Log amonia menampilkan kondisi REAL-TIME, bukan ramalan -- horizon 0
          // saja (lihat catatan di baris tabel amonia di bawah).
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

  // Ganti parameter/status/rentang -> kembali ke halaman pertama.
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

      {/* Satu panel: area kontrol dan area data menyatu, dipisah garis tipis
          alih-alih celah antar kartu. Tanpa overflow-hidden — di dalamnya ada
          kolom tanggal dan tombol pil yang outline fokusnya akan terpotong. */}
      <Card className="p-0">
        {/* Pemilih mode rentang: hari/jam/gabungan, lihat komentar RangeMode
            di atas. Grid 3 kolom rata -- bukan flex-wrap -- supaya ketiga pil
            selalu sama lebar dan sejajar rapi di layar sempit. */}
        <div className="grid grid-cols-3 gap-2 p-4 pb-0">
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
              ketiganya bermuara ke start_time/end_time yang sama lewat
              rentangIso() -- lihat komentar di sana. Kosong = semua waktu. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Rentang</span>
            {/* Tanpa text-xs: ukuran huruf diserahkan ke .input-field, yang sengaja
                16px di mobile supaya Safari iOS tidak memperbesar viewport saat kolomnya
                difokus. */}
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
                {/* Dual dropdown, JAM BULAT saja (00-23) -- lihat HOUR_OPTIONS.
                    Selesai boleh lebih kecil/sama dengan mulai: itu artinya
                    jendela melewati tengah malam (mis. 23.00 -> 00.00), bukan
                    kombinasi tidak valid, jadi tidak ada validasi yang menolaknya
                    di sini -- wraparound-nya ditangani rentangIso(). */}
                <select
                  value={jamDari}
                  onChange={(e) => setJamDari(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Jam mulai"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {jamLabel(h)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted">s/d</span>
                <select
                  value={jamSampai}
                  onChange={(e) => setJamSampai(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Jam akhir"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {jamLabel(h)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {rangeMode === "gabungan" && (
              <>
                <input
                  type="datetime-local"
                  value={datetimeDari}
                  max={datetimeSampai || undefined}
                  onChange={(e) => setDatetimeDari(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Tanggal & jam mulai"
                />
                <span className="text-xs text-muted">s/d</span>
                <input
                  type="datetime-local"
                  value={datetimeSampai}
                  min={datetimeDari || undefined}
                  onChange={(e) => setDatetimeSampai(e.target.value)}
                  className="input-field w-auto py-1.5"
                  aria-label="Tanggal & jam akhir"
                />
              </>
            )}
            {(dari || sampai || datetimeDari || datetimeSampai) && (
              <button
                type="button"
                onClick={() => {
                  setDari("");
                  setSampai("");
                  setJamDari("00");
                  setJamSampai("00");
                  setDatetimeDari("");
                  setDatetimeSampai("");
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

        {/* Pemilih parameter hanya untuk layar sempit: di atas breakpoint lg,
            submenu sidebar sudah mengerjakan hal yang sama. Di bawah lg sidebar
            tidak dirender sama sekali dan bar bawah tidak punya submenu, jadi
            tanpa ini parameter terkunci di pH. Grid 4 kolom rata, bukan
            flex-wrap, supaya keempat pil sejajar rapi di layar sempit. */}
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

        {/* Daftar reading — satu parameter saja, sama seperti aplikasi mobile.
            Badge-nya memakai cek ambang yang sama dengan filter status di
            backend (app/core/water_thresholds.py), BUKAN fuzzy Mamdani.
            ponytail: klasifikasi Mamdani ditulis satu baris per device per siklus
            scheduler (ML_BUCKET_MINUTES=60), sedangkan reading masuk tiap 1-15
            menit — jadi status fuzzy per-reading memang tidak ada datanya. Ganti
            ke endpoint riwayat klasifikasi kalau cadence keduanya disamakan. */}
        {/* Saat parameter diganti, baris lama DIBIARKAN di tempatnya dan cuma
            diredupkan. Sebelumnya kerangka 6 baris ditumpuk DI ATAS daftar lama
            yang 25 baris, jadi tingginya melompat naik lalu turun lagi dalam
            sekejap — itu yang terbaca patah, paling kentara di kolom status
            sebelah kanan. Kerangka sekarang hanya untuk keadaan yang memang
            belum punya apa pun untuk ditampilkan. */}
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
              Badge-nya memakai risk_level yang TERSIMPAN, bukan hitung ulang di
              browser — dengan begitu log dan kartu tidak bisa berselisih kalau
              ambang di backend suatu saat diubah. */}
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
                    {/* Cuma waktunya -- halaman ini sekarang hanya meminta baris
                        REAL-TIME (only_measured: true di muatHalaman), jadi
                        keterangan "ramalan +N menit"/"ekstrapolasi" yang dulu
                        ada di sini sudah tidak pernah relevan lagi. */}
                    <p className="text-xs text-muted">
                      {new Date(r.target_time).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
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
            // Baris dari parameter sebelumnya masih terpasang sesaat setelah
            // parameter diganti. SensorReading membawa ketiganya sekaligus jadi
            // nilainya biasanya ada, tapi baris yang kolomnya null tetap harus
            // aman — formatValue() menerima number, bukan null.
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
                      {/* PARAM_UI.ph.unit === "pH", jadi "8.1 pH" untuk pH saja
                          sudah cukup — tanpa satuan yang mengulang. */}
                      {param === "ph" || value == null ? "" : ` ${meta.unit}`}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(r.time).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {/* Dibungkus supaya bisa shrink-0 — StatusBadge tidak menerima
                    className, dan tanpa ini badge-nya kegencet di layar 375px. */}
                <div className="shrink-0">
                  {value != null && (
                    <StatusBadge status={statusOf(param as ParamKey, value)} size="sm" />
                  )}
                </div>
              </div>
            );
          })}

          {/* Tetap terpasang selama memuat, cuma dimatikan: kalau ia ikut hilang
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

/** Tiruan baris log: device + waktu di kiri, badge status di kanan. Dipakai juga
 *  sebagai fallback Suspense, jadi kerangkanya sama sebelum & sesudah hydrate. */
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
