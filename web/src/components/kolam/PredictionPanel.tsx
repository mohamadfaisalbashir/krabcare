import { TrendingUp, FlaskConical, Thermometer, Droplets } from "lucide-react";
import clsx from "clsx";
import { FuzzyPrediction, StatusLabel } from "@/lib/types";
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

/**
 * Perlakuan kartu per status, memakai token `status` yang sama dengan
 * StatusBadge di kartu pengukuran — jadi warnanya cocok karena satu sumber
 * token, bukan karena hex-nya disalin.
 *
 * Yang di-tint LATARNYA, bukan huruf kalimatnya: `text-status-waspada` sebagai
 * teks di atas kartu putih cuma 3.77:1 (gagal AA untuk text-sm), sedangkan
 * kalimat `text-ink/80` di atas latar ter-tint tetap 7.34:1.
 *
 * Aman sengaja dibiarkan seperti semula supaya yang menyimpang yang menonjol,
 * bukan semuanya berwarna.
 */
const STATUS_CARD: Record<StatusLabel, string> = {
  Aman: "border-border bg-surface",
  Waspada: "border-status-waspada/30 bg-status-waspadaBg",
  Bahaya: "border-status-bahaya/30 bg-status-bahayaBg",
};

const STATUS_ICON: Record<StatusLabel, string> = {
  Aman: "text-brand-500",
  Waspada: "text-status-waspada",
  Bahaya: "text-status-bahaya",
};

/** Rakit kalimat tren dari deret ramalan satu parameter.
 *
 *  Mengembalikan status juga, bukan cuma kalimat: statusnya memang sudah
 *  dihitung di sini untuk disisipkan ke teks, dan pemanggil butuh nilainya
 *  untuk mewarnai kartu. Warna karenanya tidak akan pernah bertentangan dengan
 *  kata status di dalam kalimatnya — keduanya dari perhitungan yang sama. */
function trendSentence(
  param: ParamKey,
  values: number[]
): { text: string; status: StatusLabel } {
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
      return {
        text: `${lead} di angka ${formatValue(max)} ${unit} (${status}).`,
        status,
      };
    }
    return {
      text: `Cenderung stabil di kisaran ${formatValue(min)} – ${formatValue(
        max
      )} ${unit} (${status}).`,
      status,
    };
  }

  return {
    text: `Diprediksi terus ${delta > 0 ? "naik" : "turun"} mendekati ${formatValue(
      last
    )} ${unit} (${status}).`,
    status,
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

          // Tanpa data tidak ada status, jadi kartunya tetap netral.
          const hasil = values.length > 0 ? trendSentence(param, values) : null;

          return (
            <div
              key={param}
              className={clsx(
                "rounded-xl border p-4 transition-colors",
                hasil ? STATUS_CARD[hasil.status] : "border-border bg-surface"
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon
                  className={clsx(
                    "h-4 w-4",
                    hasil ? STATUS_ICON[hasil.status] : "text-brand-500"
                  )}
                  strokeWidth={2.2}
                />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Prediksi {PARAM_UI[param].short}
                </p>
              </div>
              {/* Kalimat tetap text-ink/80 — itu yang menjaga kontras 7:1 di
                  atas latar yang sudah ter-tint. */}
              <p className="text-sm leading-relaxed text-ink/80">
                {hasil ? hasil.text : "Belum ada data prediksi."}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
