import { TrendingUp, FlaskConical, Thermometer, Droplets } from "lucide-react";
import { FuzzyPrediction } from "@/lib/types";
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

const ICON: Record<ParamKey, React.ElementType> = {
  ph: FlaskConical,
  temperature_c: Thermometer,
  salinity_ppt: Droplets,
};

// ponytail: ambang "cenderung stabil" per parameter — angka kasar dari rentang
// gerak data, bukan turunan dari proposal. Naikkan kalau pada data hardware asli
// kalimatnya terlalu sering berbunyi "naik/turun" untuk riak yang tidak berarti.
const STABLE_THRESHOLD: Record<ParamKey, number> = {
  ph: 0.1,
  temperature_c: 0.3,
  salinity_ppt: 0.5,
};

/** Rakit kalimat tren dari deret ramalan satu parameter. */
function trendSentence(param: ParamKey, values: number[]): string {
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
      // jadi menyangkal badge-nya sendiri ("Normal ... (Waspada)").
      const lead = status === "Aman" ? "Normal, bertahan" : "Bertahan";
      return `${lead} di angka ${formatValue(max)} ${unit} (${status}).`;
    }
    return `Cenderung stabil di kisaran ${formatValue(min)} – ${formatValue(
      max
    )} ${unit} (${status}).`;
  }

  return `Diprediksi terus ${delta > 0 ? "naik" : "turun"} mendekati ${formatValue(
    last
  )} ${unit} (${status}).`;
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
    <div className="rounded-xl2 border border-brand-100 bg-brand-50 p-5">
      <div className="mb-4 flex items-center gap-2 text-brand-700">
        <TrendingUp className="h-5 w-5" strokeWidth={2.2} />
        <h3 className="font-display text-base font-semibold">
          Prediksi Kualitas Air (3 Jam Kedepan)
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PARAM_KEYS.map((param) => {
          const Icon = ICON[param];
          // Baris prediksi dari sebelum kolom per parameter ada bernilai null —
          // tampilkan apa adanya, jangan rakit kalimat setengah jadi.
          const values = window
            .map((p) => p[FIELD[param]])
            .filter((v): v is number => typeof v === "number");

          return (
            <div key={param} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-500" strokeWidth={2.2} />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Prediksi {PARAM_UI[param].short}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-ink/80">
                {values.length > 0
                  ? trendSentence(param, values)
                  : "Belum ada data prediksi."}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
