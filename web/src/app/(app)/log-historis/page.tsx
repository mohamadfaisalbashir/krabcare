"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import Skeleton from "@/components/ui/Skeleton";
import ExportPanel from "@/components/log/ExportPanel";
import { SensorReading, Sensor, StatusLabel } from "@/lib/types";
import { PARAM_KEYS, PARAM_UI, ParamKey, statusOf, formatValue } from "@/lib/parameter";
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
        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
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
        subtitle="Riwayat data sensor status dari per parameter"
      />
      <Suspense fallback={<LogRowsSkeleton />}>
        <LogHistorisView />
      </Suspense>
    </>
  );
}

function LogHistorisView() {
  const router = useRouter();

  // URL adalah satu-satunya sumber kebenaran untuk parameter aktif, supaya
  // halamannya bisa di-bookmark dan tombol Back bekerja. Divalidasi karena ini
  // input dari URL: key tak dikenal akan membuat statusOf mengindeks
  // RANGE[undefined] dan melempar.
  const rawParam = useSearchParams().get("param");
  const param: ParamKey = PARAM_KEYS.includes(rawParam as ParamKey)
    ? (rawParam as ParamKey)
    : "ph";

  const [rows, setRows] = useState<SensorReading[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [sensorFilter, setSensorFilter] = useState<string>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  // Kosong = semua waktu. Format <input type="date">: "yyyy-mm-dd".
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Daftar sensor: sekali saja, tidak ikut berubah saat filter diganti.
  // Satu kolam = tepat satu device (backend menolak klaim kedua dengan 409),
  // tapi disimpan sebagai daftar datar supaya tetap benar kalau aturan itu berubah.
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
  // "Semua sensor" sengaja TIDAK mengirim device_id — scope backend sudah
  // membatasi ke device milik user. Kekhawatiran lama (sensor cerewet
  // menenggelamkan yang jarang lapor) berlaku untuk pengambilan "terbaru per
  // device" seperti di dashboard; di sini urutannya memang kronologis dan
  // riwayat yang lebih tua tinggal diminta halaman berikutnya.
  const muatHalaman = useCallback(
    (offset: number) =>
      api.getReadings({
        param,
        limit: PAGE,
        offset,
        ...(sensorFilter !== "semua" ? { device_id: Number(sensorFilter) } : {}),
        ...(statusFilter !== "Semua" ? { status: STATUS_QUERY[statusFilter] } : {}),
        // dayRangeToIso dipakai per sisi: ia yang menangani jebakan
        // tengah-malam-LOKAL vs UTC. Sisi yang kosong tidak dikirim sama sekali.
        ...(dari ? { start_time: dayRangeToIso(dari, dari).start } : {}),
        ...(sampai ? { end_time: dayRangeToIso(sampai, sampai).end } : {}),
      }),
    [param, sensorFilter, statusFilter, dari, sampai]
  );

  // Ganti parameter/sensor/status/rentang -> kembali ke halaman pertama.
  useEffect(() => {
    let batal = false;
    setLoading(true);
    setError(null);
    muatHalaman(0)
      .then((page) => {
        if (batal) return;
        setRows(page);
        setHasMore(page.length === PAGE);
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
      const page = await muatHalaman(rows.length);
      setRows((sebelumnya) => [...sebelumnya, ...page]);
      setHasMore(page.length === PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
    } finally {
      setLoadingMore(false);
    }
  }

  const meta = PARAM_UI[param];

  return (
    <div className="flex-1 space-y-5 p-5 sm:p-8">
      <ExportPanel sensors={sensors} defaultDeviceId={sensorFilter} />

      {error && (
        <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
          {error}
        </p>
      )}

      {/* Satu panel: area kontrol dan area data menyatu, dipisah garis tipis
          alih-alih celah antar kartu. Tanpa overflow-hidden — di dalamnya ada
          select dan tombol pil yang outline fokusnya akan terpotong. */}
      <Card className="p-0">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={sensorFilter}
            onChange={(e) => setSensorFilter(e.target.value)}
            className="input-field sm:w-64"
            aria-label="Pilih sensor"
          >
            <option value="semua">Semua sensor</option>
            {sensors.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>
                {s.kolamNama} — {s.deviceCode}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
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

        {/* Rentang waktu: dua <input type="date"> bawaan browser (kalender,
            keyboard, dan validasi min/max gratis). Kosong = semua waktu. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-xs font-medium text-muted">Rentang</span>
          {/* Tanpa text-xs: ukuran huruf diserahkan ke .input-field, yang sengaja
              16px di mobile supaya Safari iOS tidak memperbesar viewport saat kolomnya
              difokus. */}
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
          {(dari || sampai) && (
            <button
              type="button"
              onClick={() => {
                setDari("");
                setSampai("");
              }}
              className="py-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              Semua waktu
            </button>
          )}
        </div>

        {/* Pemilih parameter hanya untuk layar sempit: di atas breakpoint lg,
            submenu sidebar sudah mengerjakan hal yang sama. Di bawah lg sidebar
            tidak dirender sama sekali dan bar bawah tidak punya submenu, jadi
            tanpa ini parameter terkunci di pH. */}
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 lg:hidden">
          {PARAM_KEYS.map((p) => (
            <FilterPill
              key={p}
              active={param === p}
              onClick={() => router.replace(`?param=${p}`, { scroll: false })}
            >
              {PARAM_UI[p].short}
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
        <div className="divide-y divide-border border-t border-border">
          {loading && <LogRowsSkeleton />}
          {!loading && rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              Tidak ada data {meta.short} untuk filter yang dipilih.
            </p>
          )}
          {rows.map((r, i) => {
            const value = r[param]!;
            return (
              <div
                key={`${r.device_code}-${r.time}-${i}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {r.device_code}{" "}
                    <span className="text-muted">
                      {meta.label} terukur {formatValue(value)}
                      {/* PARAM_UI.ph.unit === "pH", jadi "8.1 pH" untuk pH saja
                          sudah cukup — tanpa satuan yang mengulang. */}
                      {param === "ph" ? "" : ` ${meta.unit}`}
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
                  <StatusBadge status={statusOf(param, value)} size="sm" />
                </div>
              </div>
            );
          })}

          {hasMore && !loading && (
            <div className="p-4 text-center">
              <Button variant="ghost" onClick={handleMuatLagi} disabled={loadingMore}>
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
