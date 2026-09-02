"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlugZap, Pencil, Trash2 } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import ParameterCard from "@/components/kolam/ParameterCard";
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
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { ParamKey, PARAM_KEYS, PARAM_UI } from "@/lib/parameter";
import { api } from "@/lib/api";

export default function KolamDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const kolamId = Number(id);

  const [kolam, setKolam] = useState<Kolam | null>(null);
  // Satu rak = satu device. Backend menolak klaim kedua dengan 409.
  const [device, setDevice] = useState<Device | null>(null);
  const [quality, setQuality] = useState<LatestQuality | null>(null);
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [predictions, setPredictions] = useState<FuzzyPrediction[]>([]);
  const [activeParam, setActiveParam] = useState<ParamKey>("ph");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [claiming, setClaiming] = useState(false);

  const [namaRak, setNamaRak] = useState("");
  const [savingRak, setSavingRak] = useState(false);
  const [rakMessage, setRakMessage] = useState<string | null>(null);
  // Satu state, bukan dua boolean: membuka satu panel otomatis menutup yang lain.
  const [panel, setPanel] = useState<"nama" | "hapus" | null>(null);

  const loadKolam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kolamData, deviceList] = await Promise.all([
        api.getKolam(kolamId),
        api.getKolamDevices(kolamId),
      ]);
      setKolam(kolamData);
      setNamaRak(kolamData.nama);
      setDevice(deviceList[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kolam tidak ditemukan.");
    } finally {
      setLoading(false);
    }
  }, [kolamId]);

  useEffect(() => {
    if (!kolamId) return;
    loadKolam();
  }, [kolamId, loadKolam]);

  useEffect(() => {
    if (!device) {
      setQuality(null);
      setReading(null);
      setHistory([]);
      setPredictions([]);
      return;
    }

    async function loadDeviceData(deviceId: number) {
      try {
        const [qualityList, readings, predictionList] = await Promise.all([
          api.getLatestQuality(deviceId),
          api.getReadings({ device_id: deviceId, limit: 100 }),
          api.getPredictions(deviceId),
        ]);
        setQuality(qualityList[0] ?? null);
        setReading(readings[0] ?? null);
        // Backend mengurutkan terbaru dulu (time DESC); grafik perlu urutan naik
        // supaya sumbu waktu tidak terbaca mundur.
        setHistory([...readings].reverse());
        setPredictions(predictionList[0]?.predictions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat data sensor.");
      }
    }

    const deviceId = device.id;
    loadDeviceData(deviceId);
    // Refresh senyap — loadDeviceData tidak menyentuh state `loading`, jadi
    // kartu parameter & grafik ter-update tanpa halaman berkedip.
    const id = setInterval(() => loadDeviceData(deviceId), 60_000);
    return () => clearInterval(id);
  }, [device]);

  async function handleRenameRak(e: React.FormEvent) {
    e.preventDefault();
    setRakMessage(null);
    setSavingRak(true);
    try {
      const updated = await api.updateKolam(kolamId, namaRak.trim());
      setKolam(updated);
      setRakMessage("Nama rak berhasil diperbarui.");
    } catch (err) {
      setRakMessage(err instanceof Error ? err.message : "Gagal memperbarui rak.");
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
      await loadKolam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengklaim device.");
    } finally {
      setClaiming(false);
    }
  }

  const statusLabel: StatusLabel | null = quality?.classification
    ? categoryToLabel(quality.classification.quality_category)
    : null;

  if (loading) {
    return (
      <>
        <Topbar title="Detail Rak" />
        <DetailSkeleton />
      </>
    );
  }

  if (!kolam) {
    return (
      <>
        <Topbar title="Detail Rak" />
        <p className="p-5 text-sm text-status-bahaya sm:p-8">
          {error ?? "Kolam tidak ditemukan."}
        </p>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={kolam.nama}
        subtitle={
          device
            ? `Terhubung ke ${device.device_code}`
            : "Belum terhubung ke device"
        }
      />

      <div className="flex-1 space-y-6 p-5 sm:p-8">
        {error && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {error}
          </p>
        )}

        {/* Status keseluruhan rak (klasifikasi Mamdani atas reading terakhir) */}
        {statusLabel && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Status kualitas air:</span>
            <StatusBadge status={statusLabel} />
          </div>
        )}

        {/* Nilai parameter terkini */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PARAM_KEYS.map((param) => (
            <ParameterCard key={param} param={param} value={reading?.[param] ?? null} />
          ))}
        </div>

        {/* Prediksi per parameter (FTS Chen) */}
        <PredictionPanel predictions={predictions} />

        {/* Klaim device — satu rak hanya boleh satu device, jadi form ini hilang
            begitu raknya sudah terhubung. */}
        {!device && (
          <Card className="sm:max-w-md">
            <div className="mb-3 flex items-center gap-2.5">
              <PlugZap className="h-5 w-5 text-brand-500" />
              <h3 className="font-display text-base font-semibold text-ink">
                Hubungkan device
              </h3>
            </div>
            <p className="mb-4 text-sm text-muted">
              Masukkan kode device yang terpasang pada rak ini (mis.{" "}
              <code>SLV1</code>). Satu rak terhubung ke satu device.
            </p>
            <form
              onSubmit={handleClaim}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <Input
                label="Kode device"
                placeholder="SLV1"
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value)}
                required
              />
              <Button type="submit" disabled={claiming}>
                {claiming ? "Menghubungkan..." : "Hubungkan"}
              </Button>
            </form>
          </Card>
        )}

        {/* Grafik historis */}
        {history.length > 0 && (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Grafik Pemantauan
              </h3>
              <div className="flex gap-1 rounded-lg bg-bg p-1">
                {PARAM_KEYS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setActiveParam(p)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      activeParam === p
                        ? "bg-white text-brand-600 shadow-card"
                        : "text-muted"
                    }`}
                  >
                    {PARAM_UI[p].short}
                  </button>
                ))}
              </div>
            </div>
            <HistoryChart data={history} parameter={activeParam} />
          </Card>
        )}

        {/* Ketiga parameter sekaligus — untuk melihat apakah lonjakan satu
            parameter berbarengan dengan yang lain. */}
        {history.length > 0 && (
          <Card>
            <div className="mb-4">
              <h3 className="font-display text-base font-semibold text-ink">
                Grafik Gabungan
              </h3>
              <p className="mt-1 text-xs text-muted">
                Suhu &amp; salinitas dibaca pada sumbu kiri, pH pada sumbu kanan
                (rentangnya jauh lebih sempit). Bandingkan bentuk grafiknya,
                bukan jarak antar garis.
              </p>
            </div>
            <CombinedChart data={history} />
          </Card>
        )}

        {/* Ubah nama & hapus rak: keduanya di balik tombol, panelnya baru
            terbuka saat tombolnya ditekan. */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            onClick={() => setPanel((p) => (p === "nama" ? null : "nama"))}
          >
            <Pencil className="h-4 w-4" /> Ubah nama rak
          </Button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => setPanel((p) => (p === "hapus" ? null : "hapus"))}
          >
            <Trash2 className="h-4 w-4" /> Hapus rak
          </button>
        </div>

        {/* Ubah identitas rak (PUT /kolam/:id) */}
        {panel === "nama" && (
          <Card className="sm:max-w-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <Pencil className="h-5 w-5 text-brand-500" />
              <h3 className="font-display text-base font-semibold text-ink">
                Ubah nama rak
              </h3>
            </div>
            <form
              onSubmit={handleRenameRak}
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div className="sm:w-64">
                <Input
                  label="Nama rak"
                  value={namaRak}
                  onChange={(e) => setNamaRak(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={savingRak || namaRak === kolam.nama}
              >
                {savingRak ? "Menyimpan..." : "Simpan"}
              </Button>
            </form>
            {rakMessage && <p className="mt-3 text-sm text-muted">{rakMessage}</p>}
          </Card>
        )}

        {panel === "hapus" && (
          <DangerZone
            kolamId={kolam.id}
            nama={kolam.nama}
            deviceCode={device?.device_code ?? null}
            onDeleted={() => router.push("/dashboard")}
          />
        )}
      </div>
    </>
  );
}

/** Kerangka halaman detail: baris status, tiga kartu parameter, satu blok grafik. */
function DetailSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-5 sm:p-8">
      <Skeleton className="h-6 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl2" />
    </div>
  );
}
