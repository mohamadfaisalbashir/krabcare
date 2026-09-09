"use client";

import { SensorReading } from "@/lib/types";
import { ParamKey, PARAM_KEYS, PARAM_UI, formatValue } from "@/lib/parameter";
import HistoryChart from "./HistoryChart";

/**
 * Ketiga parameter dalam satu blok, sebagai SMALL MULTIPLES — tiga panel
 * bertumpuk yang berbagi sumbu waktu, masing-masing dengan sumbu Y sendiri
 * dalam satuan aslinya.
 *
 * Sebelumnya ini satu grafik bertumpang dengan DUA sumbu Y (suhu+salinitas di
 * kiri, pH dipatok di kanan). Itu dibuang, dan bukan karena selera: pada grafik
 * dua sumbu, skala kiri dan kanan dipilih bebas, sehingga dua garis bisa
 * dibuat tampak berkorelasi — atau tampak tidak — hanya dengan menggeser
 * skalanya. Pembacanya tidak punya cara untuk tahu mana yang sedang terjadi.
 * Menumpuknya (`stackId`) lebih parah lagi: menjumlahkan pH, °C, dan ppt
 * menghasilkan tinggi yang tidak punya arti fisik apa pun.
 *
 * Small multiples menyelesaikan keduanya sekaligus dan itu anjuran baku untuk
 * seri bersatuan berbeda: tiap panel jujur pada satuannya, perbandingan antar
 * parameter dilakukan lewat BENTUK pada sumbu waktu yang sejajar, bukan lewat
 * dua skala yang dipilih tangan.
 *
 * Isinya memakai ulang HistoryChart apa adanya — komponen itu sudah membawa
 * pita ambang (optimal hijau, bahaya merah), domain terpatok yang tidak
 * melompat tiap refresh, dan tooltip yang sama. Yang ditambahkan di sini cuma
 * susunan dan label kirinya.
 */
export default function CombinedChart({ data }: { data: SensorReading[] }) {
  /** Pembacaan berangka terakhir per parameter — dipakai label kiri.
   *  Ditelusuri dari belakang, bukan ambil data[length-1]: pembacaan terakhir
   *  bisa punya kolom null sementara kolom lain terisi. */
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
        // Hanya panel TERAKHIR yang mencetak label waktu; ketiganya memakai
        // deret waktu yang sama, jadi tiga baris jam cuma pengulangan.
        const terakhir = i === PARAM_KEYS.length - 1;

        return (
          <div
            key={param}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
          >
            {/* LABEL DI KIRI. Lebar tetap w-28 mulai sm: supaya tepi kiri
                ketiga grafik lurus — kalau lebarnya mengikuti isi, panel
                "Salinitas" akan menggeser grafiknya dan garis waktu ketiga
                panel tidak lagi sejajar, yang justru inti dari small multiples. */}
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
              {/* Tinggi definitif per panel, JANGAN diganti flex-1: pembungkus
                  ini flex-col di mobile, dan flex-basis:0% di sumbu tegak
                  membuat ResponsiveContainer mengukur 0px — grafiknya hilang
                  total. Panel terbawah sedikit lebih tinggi karena ia yang
                  menanggung label sumbu waktu. */}
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
