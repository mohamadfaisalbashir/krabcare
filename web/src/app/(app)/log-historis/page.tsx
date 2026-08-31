"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import { SensorReading, Kolam, StatusLabel } from "@/lib/types";
import { PARAM_KEYS, statusOf } from "@/lib/parameter";
import { api } from "@/lib/api";
import clsx from "clsx";

const SEVERITY: StatusLabel[] = ["Aman", "Waspada", "Bahaya"];

/** Status satu reading = status TERBURUK dari ketiga parameternya.
 *  Ambangnya dipakai bersama halaman detail rak lewat lib/parameter.ts. */
function readingStatus(reading: SensorReading): StatusLabel {
  let worst: StatusLabel = "Aman";
  for (const param of PARAM_KEYS) {
    const value = reading[param];
    if (value == null) continue;
    const status = statusOf(param, value);
    if (SEVERITY.indexOf(status) > SEVERITY.indexOf(worst)) worst = status;
  }
  return worst;
}

const STATUS_FILTERS: Array<StatusLabel | "Semua"> = [
  "Semua",
  "Aman",
  "Waspada",
  "Bahaya",
];

export default function LogHistorisPage() {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [kolamList, setKolamList] = useState<Kolam[]>([]);
  // Reading hanya membawa device_id/device_code, tidak membawa kolam_id — jadi
  // pemetaan kolam → device dibuat sekali di sini supaya filternya benar.
  const [deviceIdsByKolam, setDeviceIdsByKolam] = useState<Record<number, number[]>>({});
  const [kolamFilter, setKolamFilter] = useState<string>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kolams, allReadings] = await Promise.all([
          api.listKolam(),
          api.getReadings({ limit: 500 }),
        ]);
        setKolamList(kolams);
        setReadings(allReadings);

        const pairs = await Promise.all(
          kolams.map(async (k) => {
            try {
              const devices = await api.getKolamDevices(k.id);
              return [k.id, devices.map((d) => d.id)] as const;
            } catch {
              return [k.id, [] as number[]] as const;
            }
          })
        );
        setDeviceIdsByKolam(Object.fromEntries(pairs));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(
    () =>
      readings
        .filter((r) => {
          if (kolamFilter === "semua") return true;
          const ids = deviceIdsByKolam[Number(kolamFilter)] ?? [];
          return ids.includes(r.device_id);
        })
        .filter((r) => statusFilter === "Semua" || readingStatus(r) === statusFilter)
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [readings, kolamFilter, statusFilter, deviceIdsByKolam]
  );

  return (
    <>
      <Topbar
        title="Log Historis"
        subtitle="Riwayat data sensor kualitas air per device"
      />

      <div className="flex-1 space-y-5 p-5 sm:p-8">
        {/* Filter */}
        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={kolamFilter}
            onChange={(e) => setKolamFilter(e.target.value)}
            className="input-field sm:w-56"
          >
            <option value="semua">Semua kolam</option>
            {kolamList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                  statusFilter === s
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-border text-muted hover:bg-bg"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {error && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {/* Daftar reading */}
        <Card className="p-0">
          <div className="divide-y divide-border">
            {loading && (
              <p className="p-6 text-center text-sm text-muted">Memuat log...</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">
                Tidak ada data log untuk filter yang dipilih.
              </p>
            )}
            {filtered.map((r, i) => {
              const status = readingStatus(r);
              return (
                <div
                  key={`${r.device_code}-${r.time}-${i}`}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {r.device_code}{" "}
                      <span className="text-muted">
                        pH {r.ph ?? "—"} · {r.temperature_c ?? "—"}°C ·{" "}
                        {r.salinity_ppt ?? "—"} ppt
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(r.time).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={status} size="sm" />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
