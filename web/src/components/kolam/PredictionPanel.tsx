"use client";

import clsx from "clsx";
import { FuzzyPrediction, StatusLabel } from "@/lib/types";
import { ParamKey, PARAM_KEYS, PARAM_UI, trendSentence } from "@/lib/parameter";

/** Jendela yang ditampilkan. Backend tetap meramal 6 langkah (ML_FORECAST_STEPS),
 *  langkah 4-6 dipakai deteksi anomali & backtest tapi tidak ditampilkan di sini. */
const HORIZON_MINUTES = 180;

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
 * Ramalan tiga jam ke depan, satu kolom per parameter.
 *
 * Bentuknya sengaja dibuat sama persis dengan ParameterStrip di atasnya —
 * nama parameter, status di pojok kanan, lalu isinya — supaya "keadaan
 * sekarang" dan "perkiraan nanti" terbaca sebagai dua baris dari satu
 * instrumen, bukan dua komponen yang kebetulan berdampingan.
 *
 * Yang hilang dari versi sebelumnya, dan alasannya:
 * - Grafik ramalan kecil: skalanya tidak bermakna di ruang setinggi 32px, jadi
 *   yang tersampaikan hanya lengkungan hiasan. Kalimatnya sudah menyebut arah
 *   dan angkanya, dan bentuk penuhnya ada di Grafik pemantauan.
 * - Tint pastel per status: itu ada untuk menambal kontras kalimat berwarna.
 *   Kalimatnya sekarang text-ink di atas latar polos, jadi tambalannya tidak
 *   punya pekerjaan lagi — status dibawa titik + kata di pojok.
 * - Chip panah + selisih: arahnya sudah ada di dalam kalimat, dan pojok kanan
 *   atas dipakai statusnya.
 */
export default function PredictionPanel({
  predictions,
}: {
  predictions: FuzzyPrediction[];
}) {
  const window = predictions
    .filter((p) => p.horizon_minutes <= HORIZON_MINUTES)
    .sort((a, b) => a.horizon_minutes - b.horizon_minutes);

  return (
    <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {PARAM_KEYS.map((param) => {
        const cfg = PARAM_UI[param];
        // Baris prediksi dari sebelum kolom per parameter ada bernilai null —
        // tampilkan apa adanya, jangan rakit kalimat setengah jadi.
        const values = window
          .map((p) => p[FIELD[param]])
          .filter((v): v is number => typeof v === "number");

        // Tanpa data tidak ada status, jadi kolomnya tetap netral.
        const hasil = values.length > 0 ? trendSentence(param, values) : null;

        return (
          <div key={param} className="px-1 py-4 sm:px-5 sm:py-3">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-ink">{cfg.label}</p>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
                {hasil ? (
                  <>
                    <span
                      aria-hidden
                      className={clsx("h-2 w-2 rounded-full", ACCENT[hasil.status])}
                    />
                    <span className="font-semibold text-ink">{hasil.status}</span>
                  </>
                ) : (
                  <span className="text-muted">Belum ada data</span>
                )}
              </span>
            </div>

            {/* Garis aksen: penanda kolom yang menyimpang, menggantikan tint
                latar. Di ParameterStrip peran ini dipegang track rentang, yang
                tidak ada padanannya untuk angka ramalan. */}
            <div
              aria-hidden
              className={clsx(
                "mt-3 h-0.5 rounded-full",
                hasil ? ACCENT[hasil.status] : "bg-ink/15"
              )}
            />

            <p className="mt-3 text-sm leading-relaxed text-ink">
              {hasil ? hasil.text : "Belum ada data prediksi."}
            </p>
          </div>
        );
      })}
    </div>
  );
}
