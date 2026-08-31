"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  SensorReading,
  Kolam,
  StatusLabel,
  WaterQualityCategory,
  categoryToLabel,
} from "@/lib/types";
import { mockKolam, mockHistoryReadings } from "@/lib/mock-data";
import { api } from "@/lib/api";
import clsx from "clsx";

// Batas parameter untuk menentukan status visual tiap reading
function readingStatus(reading: SensorReading): StatusLabel {
  const { ph, temperature_c, salinity_ppt } = reading;
  // Salah satu di luar toleransi → Bahaya
  if (
    (ph != null && (ph < 6.5 || ph > 9.0)) ||
    (temperature_c != null && (temperature_c < 20 || temperature_c > 35)) ||
    (salinity_ppt != null && (salinity_ppt < 5 || salinity_ppt > 40))
  ) {
    return "Bahaya";
  }
  // Salah satu di luar optimal → Waspada
  if (
    (ph != null && (ph < 7.5 || ph > 8.5)) ||
    (temperature_c != null && (temperature_c < 28 || temperature_c > 30)) ||
    (salinity_ppt != null && (salinity_ppt < 10 || salinity_ppt > 30))
  ) {
    return "Waspada";
  }
  return "Aman";
}

const STATUS_FILTERS: Array<StatusLabel | "Semua"> = [
  "Semua",
  "Aman",
  "Waspada",
  "Bahaya",
];

export default function LogHistorisPage() {
  const [readings, setReadings] = useState<SensorReading[]>(
    mockHistoryReadings(1)
  );
  const [kolamList, setKolamList] = useState<Kolam[]>(mockKolam);
  const [kolamFilter, setKolamFilter] = useState<string>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">(
    "Semua"
  );

  useEffect(() => {
    async function load() {
      try {
        const [kolams, allReadings] = await Promise.all([
          api.listKolam(),
          api.getReadings({ limit: 500 }),
        ]);
        setKolamList(kolams);
        setReadings(allReadings);
      } catch {
        // fallback ke mock data
      }
    }
    load();
  }, []);

  const filtered = useMemo(
    () =>
      readings
        .filter((r) => {
          if (kolamFilter === "semua") return true;
          // Filter by device code sebagai proxy kolam (TODO: proper kolam-device mapping)
          return r.device_code === kolamFilter;
        })
        .filter((r) => {
          if (statusFilter === "Semua") return true;
          return readingStatus(r) === statusFilter;
        })
        .sort(
          (a, b) =>
            new Date(b.time).getTime() - new Date(a.time).getTime()
        ),
    [readings, kolamFilter, statusFilter]
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
              <option key={k.id} value={k.nama}>
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

        {/* Daftar reading */}
        <Card className="p-0">
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
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
