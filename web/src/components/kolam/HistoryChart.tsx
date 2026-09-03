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
 *  Bukan kosmetik. `(40 - 5) * 0.08` = 2.8000000000000003, jadi `min - pad`
 *  salinitas = 2.1999999999999997. Recharts memakai ujung domain APA ADANYA
 *  sebagai tick pertama, dan label 18 karakter itu tidak muat di sumbu selebar
 *  44px — itulah grafik salinitas yang terlihat terpotong. pH (6.3) dan suhu
 *  (18.8) kebetulan lolos karena pad-nya bulat, jadi cuma satu dari tiga
 *  parameter yang kelihatan salah. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Riwayat satu parameter, digambar DI ATAS pita ambangnya.
 *
 * Bentuknya mengikuti rujukan image4.png: kisi TEGAK (bukan mendatar), tanpa
 * garis sumbu, dan TANPA titik sama sekali. Titik yang menetap di grafik
 * membaca sebagai "ini yang penting" padahal setiap pembacaan sama pentingnya —
 * yang tersisa cuma `activeDot`, yang hanya muncul selama kursor menyentuh
 * grafik. Nilai terakhir juga tidak lagi diberi garis berlabel: angkanya sudah
 * terbaca besar-besar di baris parameter tepat di atas grafik ini.
 *
 * Pita ambang tetap ada dan itu isi informasinya: pita hijau = rentang optimal,
 * sisanya di dalam garis putus-putus = waspada, di luar = bahaya. Batasnya
 * persis RANGE di lib/parameter.ts — sumber yang sama dengan statusOf(), jadi
 * warna pita tidak bisa bertentangan dengan status yang tertulis di atasnya.
 * Opasitasnya sengaja rendah supaya garis datanya yang terbaca lebih dulu.
 *
 * Domain Y DIPATOK ke toleransi (dengan bantalan), bukan otomatis. Dua alasan:
 * pitanya harus selalu kelihatan, dan skala otomatis melompat tiap refresh 60
 * detik sehingga bentuk grafik yang sama terlihat berubah-ubah drastis.
 */
export default function HistoryChart({
  data,
  parameter,
}: {
  data: SensorReading[];
  parameter: ParamKey;
}) {
  const cfg = PARAM_UI[parameter];
  const { min, max, optimal } = RANGE[parameter];

  // Bantalan 8% supaya garis yang menyentuh batas toleransi tidak menempel di
  // tepi bingkai, dan nilai Bahaya sedikit di luar ambang tetap tergambar.
  const pad = (max - min) * 0.08;
  const values = data
    .map((d) => d[parameter])
    .filter((v): v is number => typeof v === "number");
  // Kalau data memang keluar jauh dari toleransi, ikut lebarkan — memotong
  // pembacaan ekstrem justru menyembunyikan keadaan yang paling perlu dilihat.
  const lo = round1(Math.min(min - pad, ...values));
  const hi = round1(Math.max(max + pad, ...values));

  return (
    <div className="h-64 w-full">
      {/* debounce: ResponsiveContainer memakai ResizeObserver, dan tanpa jeda
          ini seluruh grafik digambar ulang tiap frame selama sidebar
          menguncup/membentang. Itu penyebab utama transisi sidebar tersendat. */}
      <ResponsiveContainer width="100%" height="100%" debounce={200}>
        {/* data dipakai apa adanya — nama field SensorReading sudah jadi dataKey */}
        {/* left: 0 — margin negatif menggeser area plot dan memotong label
            sumbu Y. Ruangnya diatur lewat prop `width` di YAxis. */}
        {/* TANPA syncId. Dulu grafik ini dan Grafik gabungan berbagi
            syncId="rak" supaya kursor di satu grafik menyorot titik waktu yang
            sama di grafik satunya. Yang ikut tersinkron ternyata bukan cuma
            garis kursornya: recharts menyamakan activeTooltipIndex, jadi grafik
            yang TIDAK disentuh ikut membuka kotak tooltip dan terbaca seolah
            melaporkan datanya sendiri. Angka hanya boleh muncul di grafik yang
            benar-benar ada di bawah kursor. */}
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${parameter}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.28} />
              <stop offset="60%" stopColor={cfg.color} stopOpacity={0.08} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Pita ambang digambar SEBELUM Area supaya berada di belakang garis. */}
          <ReferenceArea y1={lo} y2={min} fill="#C23B22" fillOpacity={0.05} ifOverflow="hidden" />
          <ReferenceArea y1={max} y2={hi} fill="#C23B22" fillOpacity={0.05} ifOverflow="hidden" />
          <ReferenceArea
            y1={optimal[0]}
            y2={optimal[1]}
            fill="#1F9D55"
            fillOpacity={0.07}
            ifOverflow="hidden"
          />
          {/* Garis toleransi: tipis & putus-putus — ia penanda, bukan data. */}
          <ReferenceLine y={min} stroke="#C23B22" strokeOpacity={0.3} strokeDasharray="4 4" />
          <ReferenceLine y={max} stroke="#C23B22" strokeOpacity={0.3} strokeDasharray="4 4" />

          {/* Kisi TEGAK, bukan mendatar — ini yang diambil dari image4.png.
              Garis tegak membaca sebagai penanda WAKTU, dan waktu memang sumbu
              yang dibaca orang di grafik pemantauan. */}
          <CartesianGrid vertical horizontal={false} stroke="#DCE5DD" strokeOpacity={0.9} />
          <XAxis
            dataKey="time"
            tickFormatter={chartTickLabel}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
          />
          {/* tickFormatter: penjaga kedua setelah round1 di atas — recharts
              membagi domain sendiri, jadi tick di tengah pun bisa lahir dengan
              ekor float walau kedua ujungnya sudah bulat. */}
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
            // dot={false} MUTLAK, bukan selera: titik yang menetap di tiap
            // pembacaan itulah "titik puncak" yang tidak diinginkan.
            dot={false}
            activeDot={{ r: 4, fill: cfg.color, stroke: "#FFFFFF", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
