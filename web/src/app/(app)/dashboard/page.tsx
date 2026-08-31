"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Waves } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import PondCard from "@/components/dashboard/PondCard";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { Device, KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import { api } from "@/lib/api";

/**
 * Label status UI dari klasifikasi fuzzy terbaru.
 * `null` = device kolam ini belum pernah mengirim data, jadi statusnya belum
 * bisa disimpulkan — sengaja TIDAK di-default ke "Waspada" supaya jumlah pada
 * ringkasan tidak menghitung kolam kosong sebagai anomali.
 */
function getStatusLabel(item: KolamDashboard): StatusLabel | null {
  if (!item.quality?.classification) return null;
  return categoryToLabel(item.quality.classification.quality_category);
}

export default function DashboardPage() {
  const [items, setItems] = useState<KolamDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [nama, setNama] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [saving, setSaving] = useState(false);

  // Compose dashboard dari beberapa endpoint backend:
  // 1. GET /kolam → daftar kolam
  // 2. GET /kolam/:id/devices → devices per kolam
  // 3. GET /quality/latest → kualitas terbaru semua device
  // 4. GET /readings?limit=... → reading terbaru semua device
  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [kolamList, qualityList, readingsList] = await Promise.all([
        api.listKolam(),
        api.getLatestQuality(),
        api.getReadings({ limit: 100 }),
      ]);

      const dashboard: KolamDashboard[] = await Promise.all(
        kolamList.map(async (kolam) => {
          let devices: Device[];
          try {
            devices = await api.getKolamDevices(kolam.id);
          } catch {
            devices = [];
          }
          const deviceIds = new Set(devices.map((d) => d.id));

          const quality = qualityList.find((q) => deviceIds.has(q.device_id)) ?? null;
          const latestReading =
            readingsList.find((r) => deviceIds.has(r.device_id)) ?? null;

          return { kolam, devices, quality, latestReading };
        })
      );

      setItems(dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data kolam.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleCreateKolam(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createKolam(nama, lokasi);
      setNama("");
      setLokasi("");
      setShowForm(false);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kolam.");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="grid grid-cols-3 gap-3 sm:max-w-md sm:flex-1">
            <SummaryPill label="Aman" value={summary.aman} tone="aman" />
            <SummaryPill label="Waspada" value={summary.waspada} tone="waspada" />
            <SummaryPill label="Bahaya" value={summary.bahaya} tone="bahaya" />
          </div>
          <Button variant="ghost" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1.5 inline h-4 w-4" /> Tambah Kolam
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6 sm:max-w-md">
            <form onSubmit={handleCreateKolam} className="space-y-4">
              <Input
                label="Nama kolam"
                placeholder="Kolam A - Rak 1"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
              <Input
                label="Lokasi (opsional)"
                placeholder="Surabaya"
                value={lokasi}
                onChange={(e) => setLokasi(e.target.value)}
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan kolam"}
              </Button>
            </form>
          </Card>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted">Memuat data kolam...</p>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Waves className="h-9 w-9 text-brand-300" strokeWidth={1.6} />
            <h3 className="font-display text-base font-semibold text-ink">
              Belum ada kolam
            </h3>
            <p className="max-w-sm text-sm text-muted">
              Buat kolam dulu, lalu klaim device (mis. <code>SLV1</code>) di
              halaman detail kolam supaya data sensornya mulai masuk.
            </p>
          </Card>
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
