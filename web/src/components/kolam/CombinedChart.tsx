"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { SensorReading } from "@/lib/types";
import {
  ParamKey,
  PARAM_KEYS,
  PARAM_UI,
  RANGE,
  chartTickLabel,
  chartValueLabel,
  formatValue,
} from "@/lib/parameter";
import ChartTooltip from "./ChartTooltip";

/**
 * Ketiga parameter dalam satu grafik, dua sumbu Y.
 *
 * Bentuknya mengikuti rujukan image3.png: area berisi warna, kisi tegak, dan
 * legenda berupa chip di sisi kanan. Areanya BERTUMPANG, bukan bertumpuk
 * (`stackId`) — menumpuk pH, suhu, dan salinitas berarti menjumlahkan angka
 * bersatuan berbeda, dan tinggi tumpukannya tidak akan punya arti fisik apa pun.
 * Isiannya karenanya dibuat sangat transparan supaya ketiganya tetap terbaca
 * saat saling menimpa.
 *
 * Grafik dua sumbu punya kelemahan yang perlu diingat: karena skala kiri dan
 * kanan dipilih bebas, dua bentuk bisa dibuat tampak berkorelasi hanya dengan
 * menggeser skalanya. Mitigasinya di sini: sumbu kanan DIPATOK ke rentang
 * toleransi pH (6.5-9.0) dan bukan domain otomatis, sehingga skalanya tidak
 * ikut bergerak tiap refresh 60 detik dan tidak bisa berubah tanpa sengaja.
 * Jangan diganti domain otomatis.
 */
export default function CombinedChart({ data }: { data: SensorReading[] }) {
  const axisTick = { fontSize: 11, fill: "#5C7A72" };

  /** Pembacaan berangka terakhir per parameter — dipakai chip legenda.
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
    // Chip di KOLOM KANAN mulai sm: (seperti rujukan), dan kembali jadi baris di
    // atas grafik pada layar sempit — kolom selebar 7rem di layar 375px akan
    // memeras grafiknya jadi tidak terbaca.
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-64 min-w-0 flex-1">
        {/* debounce: tanpa ini grafik digambar ulang tiap frame saat sidebar
            menguncup/membentang — penyebab utama transisinya tersendat. */}
        <ResponsiveContainer width="100%" height="100%" debounce={200}>
          {/* data dipakai apa adanya — nama field SensorReading sudah jadi dataKey */}
          {/* left: 0, bukan -18. Nilai negatif itu warisan dari HistoryChart yang
              hanya punya satu sumbu berangka pendek; di sini ia menggeser area
              plot ke kiri sehingga label sumbu kiri terpotong tepi wadah. Ruang
              sumbu diatur lewat prop `width` di YAxis, bukan lewat margin. */}
          {/* TANPA syncId — lihat alasannya di HistoryChart.tsx. Singkatnya:
              menyinkronkan kedua grafik ikut menyinkronkan tooltip, jadi grafik
              yang tidak disentuh kursor pun membuka kotak angkanya sendiri. */}
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {PARAM_KEYS.map((param) => (
                <linearGradient
                  key={param}
                  id={`area-${param}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={PARAM_UI[param].color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PARAM_UI[param].color} stopOpacity={0.04} />
                </linearGradient>
              ))}
            </defs>
            {/* Kisi TEGAK saja — diambil dari image3.png. */}
            <CartesianGrid vertical horizontal={false} stroke="#DCE5DD" strokeOpacity={0.9} />
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
            <YAxis yAxisId="left" tickFormatter={chartValueLabel} tick={axisTick} axisLine={false} tickLine={false} width={44} />
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
              content={<ChartTooltip />}
              cursor={{ stroke: "#5C7A72", strokeOpacity: 0.3, strokeWidth: 1.5 }}
            />
            {/* Urutan render = urutan tumpang tindih. Salinitas digambar duluan
                (areanya paling lebar geraknya), pH terakhir supaya garis yang
                rentangnya paling sempit tidak tertimbun. */}
            {/* connectNulls: satu pembacaan null tidak boleh memecah garis jadi titik */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="salinity_ppt"
              stroke={PARAM_UI.salinity_ppt.color}
              strokeWidth={2}
              strokeLinecap="round"
              fill="url(#area-salinity_ppt)"
              dot={false}
              activeDot={{ r: 4, fill: PARAM_UI.salinity_ppt.color, stroke: "#FFFFFF", strokeWidth: 2 }}
              connectNulls
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="temperature_c"
              stroke={PARAM_UI.temperature_c.color}
              strokeWidth={2}
              strokeLinecap="round"
              fill="url(#area-temperature_c)"
              dot={false}
              activeDot={{ r: 4, fill: PARAM_UI.temperature_c.color, stroke: "#FFFFFF", strokeWidth: 2 }}
              connectNulls
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="ph"
              stroke={PARAM_UI.ph.color}
              strokeWidth={2}
              strokeLinecap="round"
              fill="url(#area-ph)"
              dot={false}
              activeDot={{ r: 4, fill: PARAM_UI.ph.color, stroke: "#FFFFFF", strokeWidth: 2 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda kustom menggantikan <Legend> bawaan. Bukan sekadar kosmetik:
          chip-nya sekaligus membawa NILAI TERAKHIR tiap parameter, jadi baris
          yang tadinya cuma keterangan warna kini juga meringkas keadaan.
          Warnanya dari PARAM_UI, sumber yang sama dengan isian areanya. */}
      <ul className="flex shrink-0 flex-wrap gap-2 sm:w-32 sm:flex-col sm:gap-1.5">
        {PARAM_KEYS.map((param) => {
          const cfg = PARAM_UI[param];
          const value = lastOf(param);
          return (
            <li
              key={param}
              className="flex items-center gap-2 rounded-lg bg-white/50 px-2.5 py-1.5 text-xs"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: cfg.color }}
              />
              <span className="font-medium text-muted">{cfg.short}</span>
              <span className="ml-auto font-mono font-semibold text-ink">
                {value != null ? formatValue(value) : "—"}
              </span>
            </li>
          );
        })}
        <li className="text-[10px] leading-snug text-muted sm:mt-1">
          Suhu &amp; salinitas pada sumbu kiri, pH pada sumbu kanan.
        </li>
      </ul>
    </div>
  );
}
