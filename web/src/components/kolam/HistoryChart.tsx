"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { SensorReading } from "@/lib/types";
import {
  ParamKey,
  PARAM_UI,
  RANGE,
  chartTickLabel,
  chartValueLabel,
} from "@/lib/parameter";
import ChartTooltip from "./ChartTooltip";

/** Pembulatan domain sumbu Y ke 1 desimal.
 *
 *  `(40 - 5) * 0.08` = 2.8000000000000003, jadi `min - pad` salinitas jadi
 *  2.1999999999999997. Recharts memakai ujung domain apa adanya sebagai tick
 *  pertama, dan label sepanjang itu tidak muat di sumbu selebar 44px. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Riwayat satu parameter, digambar di atas pita ambangnya.
 *
 * Kisi tegak, tanpa garis sumbu, tanpa titik tetap: setiap pembacaan sama
 * pentingnya. Yang tersisa cuma `activeDot` saat kursor menyentuh grafik.
 * Nilai terakhir tidak diberi label, angkanya sudah ada di baris parameter.
 *
 * Pita ambang: hijau = optimal, di dalam garis putus-putus = waspada, di luar
 * = bahaya. Batasnya dari RANGE di lib/parameter.ts, sumber yang sama dengan
 * statusOf(), jadi warna pita tidak bisa bertentangan dengan statusnya.
 *
 * Domain Y dipatok ke toleransi (dengan bantalan), bukan otomatis: pitanya
 * harus selalu kelihatan, dan skala otomatis melompat tiap refresh 60 detik.
 */
export default function HistoryChart({
  data,
  parameter,
  height = "h-64",
  hideXAxis = false,
}: {
  data: SensorReading[];
  parameter: ParamKey;
  /** Kelas tinggi Tailwind. Panel di Grafik Gabungan lebih pendek karena ada
   *  tiga bertumpuk. Harus tinggi definitif, bukan flex-1: ResponsiveContainer
   *  mengukur 0px kalau induknya tidak punya tinggi pasti. */
  height?: string;
  /** Sumbu X disembunyikan untuk panel selain yang paling bawah di Grafik
   *  Gabungan: ketiganya memakai deret waktu yang sama, jadi label jam cukup
   *  dicetak sekali. */
  hideXAxis?: boolean;
}) {
  const cfg = PARAM_UI[parameter];
  const { min, max, optimal } = RANGE[parameter];

  // Bantalan 8% supaya garis di batas toleransi tidak menempel tepi bingkai,
  // dan nilai Bahaya sedikit di luar ambang tetap tergambar.
  const pad = (max - min) * 0.08;
  const values = data
    .map((d) => d[parameter])
    .filter((v): v is number => typeof v === "number");
  // Kalau data keluar jauh dari toleransi, ikut lebarkan. Memotong pembacaan
  // ekstrem menyembunyikan keadaan yang paling perlu dilihat.
  const lo = round1(Math.min(min - pad, ...values));
  const hi = round1(Math.max(max + pad, ...values));

  return (
    <div className={`${height} w-full`}>
      {/* debounce: ResponsiveContainer memakai ResizeObserver, dan tanpa jeda
          ini seluruh grafik digambar ulang tiap frame selama sidebar
          menguncup atau membentang. */}
      <ResponsiveContainer width="100%" height="100%" debounce={200}>
        {/* data dipakai apa adanya, nama field SensorReading sudah jadi dataKey */}
        {/* left: 0, karena margin negatif menggeser area plot dan memotong
            label sumbu Y. Ruangnya diatur lewat prop `width` di YAxis. */}
        {/* Tanpa syncId. syncId menyamakan activeTooltipIndex, bukan cuma garis
            kursornya, jadi grafik yang tidak disentuh ikut membuka tooltip.
            Angka hanya boleh muncul di grafik yang ada di bawah kursor. */}
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${parameter}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.28} />
              <stop offset="60%" stopColor={cfg.color} stopOpacity={0.08} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Pita ambang digambar sebelum Area supaya berada di belakang garis. */}
          <ReferenceArea y1={lo} y2={min} fill="#C23B22" fillOpacity={0.05} ifOverflow="hidden" />
          <ReferenceArea y1={max} y2={hi} fill="#C23B22" fillOpacity={0.05} ifOverflow="hidden" />
          <ReferenceArea
            y1={optimal[0]}
            y2={optimal[1]}
            fill="#1F9D55"
            fillOpacity={0.07}
            ifOverflow="hidden"
          />
          {/* Garis toleransi: tipis dan putus-putus, ini penanda, bukan data. */}
          <ReferenceLine y={min} stroke="#C23B22" strokeOpacity={0.3} strokeDasharray="4 4" />
          <ReferenceLine y={max} stroke="#C23B22" strokeOpacity={0.3} strokeDasharray="4 4" />

          {/* Kisi tegak, bukan mendatar: garis tegak terbaca sebagai penanda
              waktu, sumbu yang paling sering dibaca di grafik pemantauan. */}
          <CartesianGrid vertical horizontal={false} stroke="#DCE5DD" strokeOpacity={0.9} />
          {/* height={0} saat disembunyikan, bukan dilepas: XAxis harus tetap ada
              supaya recharts memetakan dataKey "time" ke sumbu kategori yang
              sama dengan panel lain. Kalau dilepas, ketiga panel bisa memakai
              pembagian titik yang berbeda. */}
          <XAxis
            dataKey="time"
            tickFormatter={chartTickLabel}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={hideXAxis ? false : { fontSize: 11, fill: "#5C7A72" }}
            height={hideXAxis ? 0 : undefined}
            axisLine={false}
            tickLine={false}
          />
          {/* tickFormatter: penjaga kedua setelah round1 di atas. recharts
              membagi domain sendiri, jadi tick di tengah bisa lahir dengan ekor
              float walau kedua ujungnya sudah bulat. */}
          <YAxis
            domain={[lo, hi]}
            tickFormatter={chartValueLabel}
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: cfg.color, strokeOpacity: 0.35, strokeWidth: 1.5 }}
          />
          {/* connectNulls: satu pembacaan null tidak boleh memecah garis jadi titik */}
          <Area
            type="monotone"
            dataKey={parameter}
            connectNulls
            stroke={cfg.color}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill={`url(#grad-${parameter})`}
            // dot={false}: titik yang menetap di tiap pembacaan bikin grafiknya
            // terbaca seolah ada nilai yang lebih penting.
            dot={false}
            activeDot={{ r: 4, fill: cfg.color, stroke: "#FFFFFF", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
