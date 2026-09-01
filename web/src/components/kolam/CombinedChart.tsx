"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { SensorReading } from "@/lib/types";
import {
  ParamKey,
  PARAM_UI,
  RANGE,
  chartTickLabel,
  formatValue,
} from "@/lib/parameter";

/**
 * Ketiga parameter dalam satu grafik, dua sumbu Y.
 *
 * Grafik dua sumbu punya kelemahan yang perlu diingat: karena skala kiri dan
 * kanan dipilih bebas, dua garis bisa dibuat tampak berkorelasi hanya dengan
 * menggeser skalanya. Mitigasinya di sini: sumbu kanan DIPATOK ke rentang
 * toleransi pH (6.5-9.0) dan bukan domain otomatis, sehingga skalanya tidak
 * ikut bergerak tiap refresh 60 detik dan tidak bisa berubah tanpa sengaja.
 *
 * Kalau nanti dirasa perlu bentuk yang lebih aman dibaca, isi komponen ini bisa
 * diganti tiga grafik mini bertumpuk tanpa menyentuh pemanggilnya.
 */
export default function CombinedChart({ data }: { data: SensorReading[] }) {
  const axisTick = { fontSize: 11, fill: "#5C7A72" };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* data dipakai apa adanya — nama field SensorReading sudah jadi dataKey */}
        {/* left: 0, bukan -18. Nilai negatif itu warisan dari HistoryChart yang
            hanya punya satu sumbu berangka pendek; di sini ia menggeser area
            plot ke kiri sehingga label sumbu kiri terpotong tepi wadah. Ruang
            sumbu diatur lewat prop `width` di YAxis, bukan lewat margin. */}
        <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" stroke="#DCE5DD" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={chartTickLabel}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
          />
          {/* Kiri: suhu (20-35) & salinitas (5-40) — rentangnya berdekatan. */}
          {/* width 44: sumbu kiri memuat suhu & salinitas, yang tick otomatisnya
              bisa berbentuk "22.5" — 36px terlalu sempit untuk itu. */}
          <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} width={44} />
          {/* Kanan: pH, dipatok ke rentang toleransi supaya skalanya stabil. */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[RANGE.ph.min, RANGE.ph.max]}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              `${formatValue(v)} ${PARAM_UI[name as ParamKey].unit}`,
              PARAM_UI[name as ParamKey].short,
            ]}
            labelFormatter={(t: string) =>
              new Date(t).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            }
            contentStyle={{ borderRadius: 10, borderColor: "#DCE5DD", fontSize: 12 }}
          />
          <Legend
            formatter={(name: string) => PARAM_UI[name as ParamKey].short}
            wrapperStyle={{ fontSize: 12 }}
          />
          {/* connectNulls: satu pembacaan null tidak boleh memecah garis jadi titik */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="temperature_c"
            stroke={PARAM_UI.temperature_c.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="salinity_ppt"
            stroke={PARAM_UI.salinity_ppt.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ph"
            stroke={PARAM_UI.ph.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
