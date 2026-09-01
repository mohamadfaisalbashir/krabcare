"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import ExportPanel from "@/components/log/ExportPanel";
import { SensorReading, Sensor, StatusLabel } from "@/lib/types";
import { PARAM_KEYS, PARAM_UI, ParamKey, statusOf, formatValue } from "@/lib/parameter";
import { api } from "@/lib/api";
import clsx from "clsx";

const STATUS_FILTERS: Array<StatusLabel | "Semua"> = [
  "Semua",
  "Aman",
  "Waspada",
  "Bahaya",
];

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
        title="Log Historis"
        subtitle="Riwayat data sensor — status dari ambang per parameter (Tabel 2.1)"
      />
      <Suspense
        fallback={<p className="p-6 text-center text-sm text-muted">Memuat log...</p>}
      >
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

  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [sensorFilter, setSensorFilter] = useState<string>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  const [loading, setLoading] = useState(true);
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

  // Selalu meminta per device_id, tidak pernah query global: /readings memotong
  // `limit` SETELAH mengurutkan time DESC lintas semua device, jadi satu fetch
  // global membuat sensor yang jarang lapor tenggelam oleh yang paling cerewet.
  // "Semua sensor" = 200 terbaru PER sensor, bukan 600 terbaru global.
  useEffect(() => {
    if (sensors.length === 0) return;

    const targets =
      sensorFilter === "semua"
        ? sensors
        : sensors.filter((s) => String(s.deviceId) === sensorFilter);

    async function loadReadings() {
      setLoading(true);
      setError(null);
      try {
        const lists = await Promise.all(
          targets.map((s) =>
            api.getReadings({
              device_id: s.deviceId,
              limit: targets.length > 1 ? 200 : 500,
            })
          )
        );
        setReadings(lists.flat());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
      } finally {
        setLoading(false);
      }
    }
    loadReadings();
  }, [sensorFilter, sensors]);

  const meta = PARAM_UI[param];

  const rows = useMemo(
    () =>
      readings
        .filter((r) => r[param] != null)
        .filter(
          (r) => statusFilter === "Semua" || statusOf(param, r[param]!) === statusFilter
        )
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [readings, param, statusFilter]
  );

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

        {/* Pemilih parameter hanya untuk layar sempit: di atas breakpoint sm,
            submenu sidebar sudah mengerjakan hal yang sama. Di bawah sm sidebar
            tidak dirender sama sekali dan bar bawah tidak punya submenu, jadi
            tanpa ini parameter terkunci di pH. */}
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:hidden">
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
            Badge-nya memakai cek ambang, BUKAN fuzzy Mamdani.
            ponytail: klasifikasi Mamdani ditulis satu baris per device per siklus
            scheduler (ML_BUCKET_MINUTES=60), sedangkan reading masuk tiap 1-15
            menit — jadi status fuzzy per-reading memang tidak ada datanya. Ganti
            ke endpoint riwayat klasifikasi kalau cadence keduanya disamakan. */}
        <div className="divide-y divide-border border-t border-border">
          {loading && (
            <p className="p-6 text-center text-sm text-muted">Memuat log...</p>
          )}
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
                <div>
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
                <StatusBadge status={statusOf(param, value)} size="sm" />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
