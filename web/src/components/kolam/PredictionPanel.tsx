"use client";

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import clsx from "clsx";
import { FuzzyPrediction, StatusLabel } from "@/lib/types";
import { PARAM_ICON } from "@/lib/param-icons";
import {
  ParamKey,
  PARAM_KEYS,
  PARAM_UI,
  formatValue,
  statusOf,
} from "@/lib/parameter";

/** Jendela yang ditampilkan. Backend tetap meramal 6 langkah (ML_FORECAST_STEPS),
 *  langkah 4-6 dipakai deteksi anomali & backtest tapi tidak ditampilkan di sini. */
const HORIZON_MINUTES = 180;

const FIELD: Record<ParamKey, keyof FuzzyPrediction> = {
  ph: "predicted_ph",
  temperature_c: "predicted_temperature_c",
  salinity_ppt: "predicted_salinity_ppt",
};

// ponytail: ambang "cenderung stabil" per parameter — angka kasar dari rentang
// gerak data, bukan turunan dari proposal. Naikkan kalau pada data hardware asli
// kalimatnya terlalu sering berbunyi "naik/turun" untuk riak yang tidak berarti.
const STABLE_THRESHOLD: Record<ParamKey, number> = {
  ph: 0.1,
  temperature_c: 0.3,
  salinity_ppt: 0.5,
};

/**
 * Tint kolom per status.
 *
 * Yang di-tint LATARNYA, bukan huruf kalimatnya, dan itu bukan pilihan gaya:
 * `text-status-waspada` sebagai teks di atas kartu putih cuma 3.77:1 (gagal AA
 * untuk text-sm), sedangkan kalimat `text-ink/80` di atas latar ter-tint tetap
 * 7.34:1. Aman sengaja dibiarkan tanpa tint supaya yang menyimpang yang
 * menonjol, bukan semuanya berwarna.
 *
 * Tanpa bingkai lagi — kolomnya sudah dipisah garis rambut oleh induknya, dan
 * bingkai di dalam bingkai itulah yang membuat panel lama terbaca bertumpuk.
 */
const STATUS_TINT: Record<StatusLabel, string> = {
  Aman: "",
  Waspada: "bg-status-waspadaBg/70",
  Bahaya: "bg-status-bahayaBg/70",
};

const STATUS_ICON: Record<StatusLabel, string> = {
  Aman: "text-brand-500",
  Waspada: "text-status-waspada",
  Bahaya: "text-status-bahaya",
};

type Arah = "naik" | "turun" | "stabil";

const ARAH_ICON: Record<Arah, React.ElementType> = {
  naik: ArrowUpRight,
  turun: ArrowDownRight,
  stabil: Minus,
};

/** Rakit kalimat tren dari deret ramalan satu parameter.
 *
 *  Mengembalikan status & arah juga, bukan cuma kalimat: keduanya memang sudah
 *  dihitung di sini untuk disisipkan ke teks, dan pemanggil butuh nilainya
 *  untuk mewarnai kolom serta menggambar chip arah. Warna dan panah karenanya
 *  tidak akan pernah bertentangan dengan kata di dalam kalimatnya — semuanya
 *  dari perhitungan yang sama. */
function trendSentence(
  param: ParamKey,
  values: number[]
): { text: string; status: StatusLabel; arah: Arah; delta: number } {
  const { unit } = PARAM_UI[param];
  const first = values[0];
  const last = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const status = statusOf(param, last);
  const delta = last - first;

  if (Math.abs(delta) < STABLE_THRESHOLD[param]) {
    if (min === max) {
      // "Normal" hanya untuk nilai yang memang Aman — kalau tidak, kalimatnya
      // jadi menyangkal statusnya sendiri ("Normal ... (Waspada)").
      const lead = status === "Aman" ? "Normal, bertahan" : "Bertahan";
      return {
        text: `${lead} di angka ${formatValue(max)} ${unit} (${status}).`,
        status,
        arah: "stabil",
        delta,
      };
    }
    return {
      text: `Cenderung stabil di kisaran ${formatValue(min)} – ${formatValue(
        max
      )} ${unit} (${status}).`,
      status,
      arah: "stabil",
      delta,
    };
  }

  return {
    text: `Diprediksi terus ${delta > 0 ? "naik" : "turun"} mendekati ${formatValue(
      last
    )} ${unit} (${status}).`,
    status,
    arah: delta > 0 ? "naik" : "turun",
    delta,
  };
}

export default function PredictionPanel({
  predictions,
}: {
  predictions: FuzzyPrediction[];
}) {
  const window = predictions
    .filter((p) => p.horizon_minutes <= HORIZON_MINUTES)
    .sort((a, b) => a.horizon_minutes - b.horizon_minutes);

  return (
    <div className="grid grid-cols-1 divide-y divide-white/60 overflow-hidden rounded-lg sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {PARAM_KEYS.map((param) => {
        const Icon = PARAM_ICON[param];
        const cfg = PARAM_UI[param];
        // Baris prediksi dari sebelum kolom per parameter ada bernilai null —
        // tampilkan apa adanya, jangan rakit kalimat setengah jadi.
        const values = window
          .map((p) => p[FIELD[param]])
          .filter((v): v is number => typeof v === "number");

        // Tanpa data tidak ada status, jadi kolomnya tetap netral.
        const hasil = values.length > 0 ? trendSentence(param, values) : null;
        const ArahIcon = hasil ? ARAH_ICON[hasil.arah] : Minus;

        return (
          <div
            key={param}
            className={clsx(
              "flex flex-col p-4 transition-colors",
              hasil ? STATUS_TINT[hasil.status] : ""
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon
                className={clsx(
                  "h-4 w-4 shrink-0",
                  hasil ? STATUS_ICON[hasil.status] : "text-brand-500"
                )}
                strokeWidth={2.2}
              />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {cfg.short}
              </p>
              {hasil && (
                // Chip arah: panah + selisih ujung-ke-ujung. Arahnya dari
                // perhitungan yang sama dengan kalimat di bawahnya, jadi
                // keduanya tidak bisa berbeda.
                <span
                  className={clsx(
                    "ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                    hasil.arah === "stabil" ? "text-muted" : "text-ink/70"
                  )}
                >
                  <ArahIcon className="h-3 w-3" strokeWidth={2.6} />
                  {hasil.arah === "stabil"
                    ? "stabil"
                    : `${hasil.delta > 0 ? "+" : "−"}${formatValue(Math.abs(hasil.delta))}`}
                </span>
              )}
            </div>

            {/* Bentuk ramalannya, bukan cuma kalimatnya. Sumbu & tooltip
                sengaja tidak ada: skalanya tidak bermakna di ruang setinggi
                32px, yang dibaca hanya arah lengkungnya. */}
            {hasil && values.length > 1 && (
              <div aria-hidden className="mb-2 h-8 w-full">
                <ResponsiveContainer width="100%" height="100%" debounce={200}>
                  <AreaChart
                    data={values.map((v, i) => ({ i, v }))}
                    margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={`pred-${param}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={cfg.color} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={cfg.color}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      // Putus-putus: ini RAMALAN, bukan pembacaan. Bedanya
                      // harus terlihat tanpa membaca judulnya dulu.
                      strokeDasharray="4 3"
                      fill={`url(#pred-${param})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Kalimat tetap text-ink/80 — itu yang menjaga kontras 7:1 di atas
                latar yang sudah ter-tint. */}
            <p className="mt-auto text-sm leading-relaxed text-ink/80">
              {hasil ? hasil.text : "Belum ada data prediksi."}
            </p>
          </div>
        );
      })}
    </div>
  );
}
