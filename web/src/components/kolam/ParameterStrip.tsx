"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import AmmoniaCell from "@/components/kolam/AmmoniaCell";
import { AmmoniaRisk, SensorReading, StatusLabel } from "@/lib/types";
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
 * Tiga pembacaan terkini sebagai satu baris, bukan tiga kartu, supaya tidak
 * jadi kotak di dalam kotak di dalam panel konten.
 *
 * Pemisahnya garis `ink/15`, bukan `white/60`: garis putih di atas lembar kaca
 * yang juga keputihan tidak terlihat dan ketiga kolom meleleh jadi satu blok.
 */
export default function ParameterStrip({
  reading,
  ammonia,
}: {
  reading: SensorReading | null;
  /** Kolom keempat: indeks risiko amonia untuk kondisi terukur (horizon 0).
   *  Dari backend, bukan dihitung ulang di browser, supaya sama persis dengan
   *  baris yang tersimpan di log historis. */
  ammonia?: AmmoniaRisk | null;
}) {
  return (
    // 4 kolom: amonia duduk berdampingan dengan ketiga parameter asalnya.
    // Di layar sempit menumpuk satu per baris.
    <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {PARAM_KEYS.map((param) => (
        <ParameterCell key={param} param={param} value={reading?.[param] ?? null} />
      ))}
      <AmmoniaCell mode="terkini" current={ammonia ?? null} />
    </div>
  );
}

/** Penanda nilai di atas track rentang. Satu-satunya tempat warna status
 *  dipakai sebagai isian di kolom ini. */
const MARKER: Record<StatusLabel, string> = {
  Aman: "bg-status-aman",
  Waspada: "bg-status-waspada",
  Bahaya: "bg-status-bahaya",
};

function ParameterCell({ param, value }: { param: ParamKey; value: number | null }) {
  const { label, short, unit } = PARAM_UI[param];
  const { min, max } = RANGE[param];

  const status = value != null ? statusOf(param, value) : null;
  const [bandStart, bandWidth] = optimalBand(param);

  return (
    <div className="group px-1 py-4 sm:px-5 sm:py-3">
      {/* Kepala: nama parameter di kiri, status di kanan. Statusnya di pojok,
          bukan di bawah angka, supaya kondisi semua kolom bisa dibaca sekali
          sapu. */}
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <span className="ml-auto flex w-24 shrink-0 items-center gap-1.5 text-xs">
          {status ? (
            <>
              {/* Titik membawa warna, kata membawa makna. Kata statusnya text-ink,
                  bukan text-status-*: #B9740E (Waspada) di atas latar terang
                  cuma 3,77:1 dan gagal AA untuk ukuran ini. Warnanya pindah ke
                  titik, yang tidak terikat ambang kontras teks. */}
              <span aria-hidden className={clsx("h-2 w-2 rounded-full", MARKER[status])} />
              <span className="font-semibold text-ink">{status}</span>
            </>
          ) : (
            <span className="text-muted">Belum ada data</span>
          )}
        </span>
        {/* Tautan per parameter, bukan satu tautan untuk semuanya: tanpa
            `?param=` halaman log jatuh ke fallback "ph" dan ketiga kolom
            bermuara ke tampilan yang sama. */}
        <Link
          href={`/log-historis?param=${param}`}
          aria-label={`Log historis ${short}`}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-white/60 hover:text-brand-700 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
        </Link>
      </div>

      {/* Angka monospace: lebar digit yang tetap membuat koma ketiga kolom
          sejajar walau angkanya berganti tiap menit. */}
      <p className="mt-3 flex items-baseline justify-end gap-1.5 sm:justify-start">
        <span className="font-mono text-3xl font-semibold leading-none text-ink">
          {value != null ? formatValue(value) : "N/A"}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </p>

      {/* Track rentang. Batang = seluruh rentang toleransi, pita terang di
          dalamnya = rentang optimal, penanda = nilai sekarang. Ini yang
          menunjukkan seberapa dekat nilainya ke tepi, bukan cuma kata
          "Waspada". Persentasenya dari rangePercent() dan optimalBand() di
          lib/parameter.ts, satu skala untuk penanda dan pita. */}
      <div className="mt-4">
        <div className="relative h-1.5 rounded-full bg-status-waspadaBg/80">
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-full bg-[#0F7078]/25"
            style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
          />
          {value != null && (
            <span
              // Cincin putih supaya penanda tetap terbaca di atas pita mana pun.
              className={clsx(
                "absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-500 ease-smooth motion-reduce:transition-none",
                MARKER[statusOf(param, value)]
              )}
              style={{ left: `${rangePercent(param, value)}%` }}
              title={`${formatValue(value)} ${unit}`}
            />
          )}
        </div>
        <div className="mt-1 grid grid-cols-3 font-mono text-[10px] text-muted">
          <span className="text-left">{formatValue(min)}</span>
          <span className="text-center text-status-aman">
            {formatValue(RANGE[param].optimal[0])} s/d {formatValue(RANGE[param].optimal[1])}
          </span>
          <span className="text-right">{formatValue(max)}</span>
        </div>
      </div>
    </div>
  );
}
