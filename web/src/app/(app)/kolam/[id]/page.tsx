"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrendingUp } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import ParameterGauge from "@/components/kolam/ParameterGauge";
import HistoryChart from "@/components/kolam/HistoryChart";
import {
  Kolam,
  SensorReading,
  LatestQuality,
  DevicePredictions,
  StatusLabel,
  categoryToLabel,
} from "@/lib/types";
import { mockKolam, mockDashboard, mockHistoryReadings } from "@/lib/mock-data";
import { api } from "@/lib/api";

type ParamKey = "ph" | "temperature_c" | "salinity_ppt";

// Batas toleransi & optimal mengacu pada Tabel 2.1 (Bab 2.2.1) dokumen CD GAB
const RANGE = {
  ph: { min: 6.5, max: 9.0, label: "7,5 – 8,5" },
  temperature_c: { min: 20, max: 35, label: "28 – 30°C" },
  salinity_ppt: { min: 5, max: 40, label: "10 – 30 ppt" },
};

const PARAM_UI: Record<ParamKey, { label: string; unit: string }> = {
  ph: { label: "pH", unit: "pH" },
  temperature_c: { label: "Suhu", unit: "°C" },
  salinity_ppt: { label: "Salinitas", unit: "ppt" },
};

function statusOf(param: ParamKey, value: number): StatusLabel {
  const optimal =
    param === "ph"
      ? [7.5, 8.5]
      : param === "temperature_c"
      ? [28, 30]
      : [10, 30];
  const [tolMin, tolMax] = [RANGE[param].min, RANGE[param].max];
  if (value < tolMin || value > tolMax) return "Bahaya";
  if (value < optimal[0] || value > optimal[1]) return "Waspada";
  return "Aman";
}

function percentOfRange(param: ParamKey, value: number) {
  const { min, max } = RANGE[param];
  return ((value - min) / (max - min)) * 100;
}

export default function KolamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const kolamId = Number(id);

  const fallback = mockDashboard.find((d) => d.kolam.id === kolamId) ?? mockDashboard[0];

  const [kolam, setKolam] = useState<Kolam>(fallback.kolam);
  const [reading, setReading] = useState<SensorReading | null>(fallback.latestReading);
  const [history, setHistory] = useState<SensorReading[]>(
    mockHistoryReadings(fallback.latestReading?.device_id ?? 1)
  );
  const [quality, setQuality] = useState<LatestQuality | null>(fallback.quality);
  const [predictions, setPredictions] = useState<DevicePredictions | null>(null);
  const [activeParam, setActiveParam] = useState<ParamKey>("ph");

  useEffect(() => {
    if (!kolamId) return;

    async function load() {
      try {
        const [kolamData, devices] = await Promise.all([
          api.getKolam(kolamId),
          api.getKolamDevices(kolamId),
        ]);
        setKolam(kolamData);

        if (devices.length > 0) {
          const deviceId = devices[0].id;

          const [qualityData, readingsData, predsData] = await Promise.all([
            api.getLatestQuality(deviceId),
            api.getReadings({ device_id: deviceId, limit: 100 }),
            api.getPredictions(deviceId),
          ]);

          setQuality(qualityData[0] ?? null);
          setReading(readingsData[0] ?? null);
          setHistory(readingsData);
          setPredictions(predsData[0] ?? null);
        }
      } catch {
        // fallback ke mock data
      }
    }

    load();
  }, [kolamId]);

  // Status prediksi terdekat
  const nextPrediction = quality?.prediction;
  const predictionLabel: StatusLabel | null = nextPrediction?.predicted_category
    ? categoryToLabel(nextPrediction.predicted_category)
    : null;

  return (
    <>
      <Topbar title={kolam.nama} subtitle="Detail kondisi kualitas air kolam" />

      <div className="flex-1 space-y-6 p-5 sm:p-8">
        {/* Nilai parameter saat ini */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["ph", "temperature_c", "salinity_ppt"] as ParamKey[]).map((param) => {
            const value = reading?.[param];
            if (value == null) return null;
            const ui = PARAM_UI[param];
            return (
              <ParameterGauge
                key={param}
                label={ui.label}
                value={value}
                unit={ui.unit}
                status={statusOf(param, value)}
                rentangOptimal={RANGE[param].label}
                percentOfRange={percentOfRange(param, value)}
              />
            );
          })}
        </div>

        {/* Prediksi (fuzzy time series) */}
        {nextPrediction && predictionLabel && (
          <Card className="flex items-start gap-4">
            <div className="rounded-lg bg-brass-100 p-2.5 text-brass-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="font-display text-base font-semibold text-ink">
                  Prediksi {nextPrediction.horizon_minutes} menit ke depan
                </h3>
                <StatusBadge status={predictionLabel} size="sm" />
              </div>
              <p className="text-sm text-muted">
                Skor kualitas diperkirakan{" "}
                <span className="font-semibold text-ink">
                  {nextPrediction.predicted_quality_score?.toFixed(1) ?? "—"}
                </span>{" "}
                ({predictionLabel}) pada{" "}
                {new Date(nextPrediction.target_time).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </p>
            </div>
          </Card>
        )}

        {/* Grafik historis */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">
              Grafik Pemantauan
            </h3>
            <div className="flex gap-1 rounded-lg bg-bg p-1">
              {(["ph", "temperature_c", "salinity_ppt"] as ParamKey[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setActiveParam(p)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    activeParam === p
                      ? "bg-white text-brand-600 shadow-card"
                      : "text-muted"
                  }`}
                >
                  {PARAM_UI[p].label}
                </button>
              ))}
            </div>
          </div>
          <HistoryChart data={history} parameter={activeParam} />
        </Card>
      </div>
    </>
  );
}
