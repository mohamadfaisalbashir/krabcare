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

/** Status satu reading = status TERBURUK dari ketiga parameternya, dihitung dari
 *  ambang Tabel 2.1 (lib/parameter.ts). Ini BUKAN hasil fuzzy Mamdani.
 *
 *  ponytail: klasifikasi Mamdani ditulis satu baris per device per siklus
 *  scheduler (ML_BUCKET_MINUTES=60), sedangkan reading masuk tiap 1-15 menit —
 *  jadi status fuzzy per-reading memang tidak ada datanya. Halaman ini sengaja
 *  memakai cek ambang dan menamainya begitu. Ganti ke endpoint riwayat
 *  klasifikasi kalau nanti cadence keduanya disamakan. */
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
  // Satu kolam = tepat satu device (backend menolak klaim kedua dengan 409),
  // jadi peta ini cukup menyimpan satu id per kolam.
  const [deviceIdByKolam, setDeviceIdByKolam] = useState<Record<number, number>>({});
  const [kolamFilter, setKolamFilter] = useState<string>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusLabel | "Semua">("Semua");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Daftar kolam + peta device-nya: sekali saja, tidak ikut berubah saat filter diganti.
  useEffect(() => {
    async function loadKolam() {
      try {
        const kolams = await api.listKolam();
        setKolamList(kolams);
        const pairs = await Promise.all(
          kolams.map(async (k) => {
            try {
              const devices = await api.getKolamDevices(k.id);
              return [k.id, devices[0]?.id] as const;
            } catch {
              return [k.id, undefined] as const;
            }
          })
        );
        setDeviceIdByKolam(
          Object.fromEntries(pairs.filter((p): p is readonly [number, number] => p[1] != null))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat daftar kolam.");
      }
    }
    loadKolam();
  }, []);

  // Reading di-fetch ulang tiap filter kolam berubah, DENGAN device_id.
  // Menyaring di klien tidak cukup: /readings memotong `limit` setelah
  // mengurutkan time DESC lintas semua device, jadi sekali fetch global cuma
  // memuat beberapa jam terakhir dan riwayat per kolam ikut terpotong.
  useEffect(() => {
    const deviceId = kolamFilter === "semua" ? undefined : deviceIdByKolam[Number(kolamFilter)];
    // Kolam terpilih belum punya device → tidak ada yang bisa diminta.
    if (kolamFilter !== "semua" && deviceId == null) {
      setReadings([]);
      setLoading(false);
      return;
    }

    async function loadReadings() {
      setLoading(true);
      setError(null);
      try {
        setReadings(await api.getReadings({ device_id: deviceId, limit: 500 }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat log sensor.");
      } finally {
        setLoading(false);
      }
    }
    loadReadings();
  }, [kolamFilter, deviceIdByKolam]);

  const filtered = useMemo(
    () =>
      readings
        .filter((r) => statusFilter === "Semua" || readingStatus(r) === statusFilter)
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [readings, statusFilter]
  );

  return (
    <>
      <Topbar
        title="Log Historis"
        subtitle="Riwayat data sensor — status dari ambang per parameter (Tabel 2.1)"
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

        <p className="text-xs leading-relaxed text-muted">
          Badge di bawah menandai apakah tiap nilai masih di dalam ambang toleransi
          parameternya. Status kualitas air hasil fuzzy Mamdani ada di halaman
          Dashboard dan Detail Rak — keduanya memang bisa berbeda karena
          klasifikasi fuzzy dihitung sekali per jam, bukan per reading.
        </p>

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
