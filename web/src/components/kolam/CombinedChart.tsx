"use client";

import { SensorReading } from "@/lib/types";
import { ParamKey, PARAM_KEYS, PARAM_UI, formatValue } from "@/lib/parameter";
import HistoryChart from "./HistoryChart";

/**
 * Ketiga parameter sebagai small multiples: tiga panel bertumpuk yang berbagi
 * sumbu waktu, masing-masing dengan sumbu Y dalam satuan aslinya.
 *
 * Bukan satu grafik bertumpang dua sumbu Y: di sana skala kiri dan kanan
 * dipilih bebas, jadi dua garis bisa dibuat tampak berkorelasi atau tidak
 * hanya dengan menggeser skalanya. Menumpuknya (`stackId`) lebih buruk lagi,
 * jumlah pH + °C + ppt tidak punya arti fisik.
 *
 * Isinya memakai ulang HistoryChart, yang sudah membawa pita ambang, domain
 * terpatok, dan tooltip yang sama. Di sini cuma susunan dan label kirinya.
 */
export default function CombinedChart({ data }: { data: SensorReading[] }) {
  /** Pembacaan berangka terakhir per parameter untuk label kiri. Ditelusuri
   *  dari belakang, bukan data[length-1]: baris terakhir bisa punya kolom null
   *  sementara kolom lain terisi. */
  function lastOf(param: ParamKey): number | null {
    for (let i = data.length - 1; i >= 0; i--) {
      const v = data[i][param];
      if (typeof v === "number") return v;
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {PARAM_KEYS.map((param, i) => {
        const cfg = PARAM_UI[param];
        const value = lastOf(param);
        // Hanya panel terakhir yang mencetak label waktu; ketiganya memakai
        // deret waktu yang sama.
        const terakhir = i === PARAM_KEYS.length - 1;

        return (
          <div
            key={param}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
          >
            {/* Label kiri, lebar tetap w-28 mulai sm: supaya tepi kiri ketiga
                grafik lurus. Kalau lebarnya mengikuti isi, panel "Salinitas"
                menggeser grafiknya dan garis waktu ketiga panel tidak sejajar. */}
            <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: cfg.color }}
                />
                <span className="text-xs font-semibold text-ink">{cfg.short}</span>
              </span>
              <span className="font-mono text-sm font-semibold text-ink sm:text-base">
                {value != null ? formatValue(value) : "N/A"}
                <span className="ml-1 font-sans text-[10px] font-medium text-muted">
                  {cfg.unit}
                </span>
              </span>
            </div>

            <div className="w-full min-w-0 sm:flex-1">
              {/* Tinggi definitif per panel, jangan diganti flex-1: pembungkus
                  ini flex-col di mobile, dan flex-basis:0% di sumbu tegak bikin
                  ResponsiveContainer mengukur 0px. Panel terbawah sedikit lebih
                  tinggi karena menanggung label sumbu waktu. */}
              <HistoryChart
                data={data}
                parameter={param}
                height={terakhir ? "h-40" : "h-32"}
                hideXAxis={!terakhir}
              />
            </div>
          </div>
        );
      })}

      <p className="text-[10px] leading-snug text-muted sm:pl-[7.75rem]">
        Tiap parameter punya sumbu nilainya sendiri dalam satuan asli, dan
        ketiganya berbagi sumbu waktu yang sama. Arti pita warnanya sama dengan
        Grafik Pemantauan di atas.
      </p>
    </div>
  );
}
