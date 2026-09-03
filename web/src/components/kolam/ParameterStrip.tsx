"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import clsx from "clsx";
import { PARAM_ICON } from "@/lib/param-icons";
import { SensorReading, StatusLabel } from "@/lib/types";
import {
  ParamKey,
  PARAM_KEYS,
  PARAM_UI,
  RANGE,
  formatValue,
  optimalBand,
  rangePercent,
  statusOf,
} from "@/lib/parameter";

/**
 * Tiga pembacaan terkini sebagai SATU baris, bukan tiga kartu.
 *
 * Sebelumnya tiap parameter adalah kartu kaca sendiri — di dalam panel kaca, di
 * dalam panel konten. Kotak-dalam-kotak-dalam-kotak itu yang membuat halamannya
 * terbaca seperti tumpukan komponen, bukan seperti satu lembar informasi. Di
 * sini pemisahnya cuma garis rambut, dan tiap kolom tidak punya `backdrop-filter`
 * sendiri — ia sudah duduk di atas backdrop yang diblur lembar induknya, dan
 * memblur ulang tiga kali hanya menambah biaya cat tanpa menambah tampilan.
 *
 * Isi tiap kolom tidak dikurangi sedikit pun dari versi kartunya.
 */
export default function ParameterStrip({
  reading,
  history,
}: {
  reading: SensorReading | null;
  history: SensorReading[];
}) {
  return (
    <div className="grid grid-cols-1 divide-y divide-white/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {PARAM_KEYS.map((param) => (
        <ParameterCell
          key={param}
          param={param}
          value={reading?.[param] ?? null}
          history={history}
        />
      ))}
    </div>
  );
}

/** Warna teks status. Dipakai untuk kata statusnya saja — angkanya tetap
 *  `text-ink` supaya yang paling besar di layar juga yang paling kontras. */
const STATUS_TEXT: Record<StatusLabel, string> = {
  Aman: "text-status-aman",
  Waspada: "text-status-waspada",
  Bahaya: "text-status-bahaya",
};

const MARKER: Record<StatusLabel, string> = {
  Aman: "bg-status-aman",
  Waspada: "bg-status-waspada",
  Bahaya: "bg-status-bahaya",
};

/** Jendela sparkline. 24 pembacaan cukup untuk memperlihatkan bentuk tren
 *  tanpa memampatkan grafik selebar 6rem jadi garis rata. */
const SPARK_WINDOW = 24;

function ParameterCell({
  param,
  value,
  history,
}: {
  param: ParamKey;
  value: number | null;
  history: SensorReading[];
}) {
  const { label, short, unit, color } = PARAM_UI[param];
  const Icon = PARAM_ICON[param];
  const { min, max } = RANGE[param];

  const status = value != null ? statusOf(param, value) : null;
  const [bandStart, bandWidth] = optimalBand(param);
  const spark = history.slice(-SPARK_WINDOW);
  const hasSpark = spark.some((r) => typeof r[param] === "number");

  return (
    <div className="group px-1 py-4 sm:px-5 sm:py-2">
      <div className="flex items-center gap-2">
        <Icon
          className={clsx("h-4 w-4 shrink-0", status ? STATUS_TEXT[status] : "text-muted")}
          strokeWidth={2.2}
        />
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        {/* Tautan per parameter, bukan satu tautan untuk semuanya: tanpa
            `?param=` halaman log jatuh ke fallback "ph" dan ketiga kolom
            bermuara ke tampilan yang sama. */}
        <Link
          href={`/log-historis?param=${param}`}
          aria-label={`Log historis ${short}`}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-white/60 hover:text-brand-700 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
        </Link>
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-semibold leading-none text-ink">
              {value != null ? formatValue(value) : "—"}
            </span>
            <span className="text-sm text-muted">{unit}</span>
          </p>
          <p className="mt-1.5 text-xs font-medium">
            {status ? (
              <span className={STATUS_TEXT[status]}>{status}</span>
            ) : (
              <span className="text-muted">Belum ada data</span>
            )}
          </p>
        </div>
        {/* Sparkline tanpa sumbu & tooltip: tugasnya cuma memberi BENTUK
            (naik / turun / bergelombang). Angka pastinya ada di sebelahnya,
            riwayat penuhnya ada di grafik bawah. */}
        {hasSpark && (
          <div aria-hidden className="h-9 w-20 shrink-0">
            {/* debounce: tanpa ini tiap sparkline menggambar ulang di SETIAP
                frame saat sidebar dikuncupkan — delapan grafik × 60fps. */}
            <ResponsiveContainer width="100%" height="100%" debounce={200}>
              <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${param}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={param}
                  connectNulls
                  stroke={color}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  fill={`url(#spark-${param})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* TRACK RENTANG. Batang = seluruh rentang toleransi; pita terang di
          dalamnya = rentang optimal; penanda = nilai sekarang. Yang didapat
          pembaca bukan cuma kata "Waspada", tapi SEBERAPA DEKAT ke tepi.
          Persentasenya dihitung rangePercent()/optimalBand() di lib/parameter.ts
          — satu skala untuk penanda dan pita, jadi keduanya tidak bisa saling
          bertentangan. */}
      <div className="mt-3">
        <div className="relative h-1.5 rounded-full bg-status-waspadaBg/80">
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-full bg-status-aman/25"
            style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
          />
          {value != null && (
            <span
              // Cincin putih supaya penanda tetap terbaca di atas pita mana pun
              // yang kebetulan ada di belakangnya.
              className={clsx(
                "absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-500 ease-smooth motion-reduce:transition-none",
                MARKER[statusOf(param, value)]
              )}
              style={{ left: `${rangePercent(param, value)}%` }}
              title={`${formatValue(value)} ${unit}`}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>{formatValue(min)}</span>
          <span className="text-status-aman">optimal</span>
          <span>{formatValue(max)}</span>
        </div>
      </div>
    </div>
  );
}
