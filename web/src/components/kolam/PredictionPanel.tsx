"use client";

import clsx from "clsx";
import AmmoniaCell from "@/components/kolam/AmmoniaCell";
import { AmmoniaRisk, FuzzyPrediction, StatusLabel } from "@/lib/types";
import { ParamKey, PARAM_KEYS, PARAM_UI, trendSentence } from "@/lib/parameter";

/** Ketiga horizon yang dikirim edge (Raspi): 15, 30, 60 menit. Tidak ada
 *  langkah lain untuk difilter, konstanta ini cuma jaga-jaga kalau suatu saat
 *  backend menerima horizon tambahan yang belum perlu ditampilkan di sini. */
const HORIZON_MINUTES = 60;

/** Tiga horizon yang ditampilkan, satu baris per horizon. */
const HORIZONS: readonly number[] = [15, 30, 60];

const FIELD: Record<ParamKey, keyof FuzzyPrediction> = {
  ph: "predicted_ph",
  temperature_c: "predicted_temperature_c",
  salinity_ppt: "predicted_salinity_ppt",
};

/** Warna status, dipakai untuk titik di pojok dan garis aksen di bawah kepala
 *  kolom — dua tempat yang sama-sama BUKAN teks, jadi tidak terikat ambang
 *  kontras 4,5:1 seperti kata statusnya. */
const ACCENT: Record<StatusLabel, string> = {
  Aman: "bg-status-aman",
  Waspada: "bg-status-waspada",
  Bahaya: "bg-status-bahaya",
};

/**
 * Ramalan 15/30/60 menit ke depan, satu kolom per parameter, TIGA baris per
 * kolom (satu baris per horizon) — bukan satu kalimat tren gabungan.
 *
 * Nama parameter TANPA status di pojok kanan (dihapus sengaja): dengan tiga
 * horizon sekaligus, satu status ringkasan di pojok jadi tidak mewakili
 * ketiganya. Garis aksen di bawah nama parameter sengaja NETRAL (bg-ink),
 * bukan warna status lagi — warnanya sekarang pindah jadi bulatan kecil di
 * depan MASING-MASING baris horizon, karena status 15/30/60 menit bisa
 * berbeda satu sama lain dan satu garis tidak bisa mewakili ketiganya
 * sekaligus. Arti warnanya dijelaskan di legenda atas panel (RakDetail).
 */
export default function PredictionPanel({
  predictions,
  ammoniaForecast,
}: {
  predictions: FuzzyPrediction[];
  /** Risiko amonia per horizon, dihitung backend dari nilai ramalan FTS
   *  ketiga parameter di baris yang sama. */
  ammoniaForecast?: AmmoniaRisk[];
}) {
  const window = predictions
    .filter((p) => p.horizon_minutes <= HORIZON_MINUTES)
    .sort((a, b) => a.horizon_minutes - b.horizon_minutes);

  return (
    // Jumlah kolom mengikuti ParameterStrip di atasnya — dua baris dari satu
    // instrumen, jadi kolom ke-n di sini harus sejajar dengan kolom ke-n di sana.
    <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {PARAM_KEYS.map((param) => {
        const cfg = PARAM_UI[param];

        return (
          <div key={param} className="px-1 py-4 sm:px-5 sm:py-3">
            <p className="truncate text-sm font-medium text-ink">{cfg.label}</p>

            {/* Garis aksen netral: pemisah kolom, bukan lagi pembawa warna
                status (lihat catatan di atas fungsi). */}
            <div aria-hidden className="mt-3 h-0.5 rounded-full bg-ink" />

            {/* Satu baris per horizon (15/30/60 menit), masing-masing dengan
                bulatan warna statusnya sendiri. */}
            <div className="mt-3 space-y-1.5">
              {HORIZONS.map((horizon) => {
                const value = window.find((p) => p.horizon_minutes === horizon)?.[
                  FIELD[param]
                ];
                const baris =
                  typeof value === "number" ? trendSentence(param, [value]) : null;
                return (
                  <p
                    key={horizon}
                    className="flex items-start gap-1.5 text-sm leading-relaxed text-ink"
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        baris ? ACCENT[baris.status] : "bg-ink/15"
                      )}
                    />
                    <span>
                      <span className="font-medium">{horizon} menit:</span>{" "}
                      {baris ? baris.text : "Belum ada data prediksi."}
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        );
      })}
      <AmmoniaCell mode="prediksi" forecast={ammoniaForecast ?? []} />
    </div>
  );
}
