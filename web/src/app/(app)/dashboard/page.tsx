"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import PondCard from "@/components/dashboard/PondCard";
import { KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import { mockDashboard } from "@/lib/mock-data";
import { api } from "@/lib/api";

/** Derive status label UI dari KolamDashboard. */
function getStatusLabel(item: KolamDashboard): StatusLabel {
  if (!item.quality?.classification) return "Waspada";
  return categoryToLabel(item.quality.classification.quality_category);
}

export default function DashboardPage() {
  const [items, setItems] = useState<KolamDashboard[]>(mockDashboard);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    // Compose dashboard dari beberapa endpoint backend:
    // 1. GET /kolam → daftar kolam
    // 2. GET /kolam/:id/devices → devices per kolam
    // 3. GET /quality/latest → kualitas terbaru semua device
    // 4. GET /readings?limit=... → reading terbaru semua device
    async function loadDashboard() {
      try {
        const [kolamList, qualityList, readingsList] = await Promise.all([
          api.listKolam(),
          api.getLatestQuality(),
          api.getReadings({ limit: 100 }),
        ]);

        // Untuk tiap kolam, ambil devices dan cocokkan quality + reading
        const dashboard: KolamDashboard[] = await Promise.all(
          kolamList.map(async (kolam) => {
            let devices;
            try {
              devices = await api.getKolamDevices(kolam.id);
            } catch {
              devices = [];
            }
            const deviceIds = new Set(devices.map((d) => d.id));

            // Cari quality dan reading pertama yang cocok device di kolam ini
            const quality = qualityList.find((q) => deviceIds.has(q.device_id)) ?? null;
            const latestReading = readingsList.find((r) => deviceIds.has(r.device_id)) ?? null;

            return { kolam, devices, quality, latestReading };
          })
        );

        setItems(dashboard);
      } catch {
        // fallback ke data contoh selama backend belum tersambung
        setItems(mockDashboard);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const summary = useMemo(
    () => ({
      aman: items.filter((i) => getStatusLabel(i) === "Aman").length,
      waspada: items.filter((i) => getStatusLabel(i) === "Waspada").length,
      bahaya: items.filter((i) => getStatusLabel(i) === "Bahaya").length,
    }),
    [items]
  );

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle={`${items.length} kolam terhubung pada akun Anda`}
      />

      <div className="flex-1 p-5 sm:p-8">
        <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
          <SummaryPill label="Aman" value={summary.aman} tone="aman" />
          <SummaryPill label="Waspada" value={summary.waspada} tone="waspada" />
          <SummaryPill label="Bahaya" value={summary.bahaya} tone="bahaya" />
        </div>

        {loading ? (
          <p className="text-sm text-muted">Memuat data kolam...</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <PondCard key={item.kolam.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const TONE_BORDER: Record<"aman" | "waspada" | "bahaya", string> = {
  aman: "border-t-status-aman",
  waspada: "border-t-status-waspada",
  bahaya: "border-t-status-bahaya",
};

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
    <div className={`card px-4 py-3 border-t-2 ${TONE_BORDER[tone]}`}>
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs font-medium text-muted">Kolam {label}</p>
    </div>
  );
}
