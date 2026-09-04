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
 * Tiga pembacaan terkini sebagai SATU baris, bukan tiga kartu.
 *
 * Sebelumnya tiap parameter adalah kartu kaca sendiri — di dalam panel kaca, di
 * dalam panel konten. Kotak-dalam-kotak-dalam-kotak itu yang membuat halamannya
 * terbaca seperti tumpukan komponen, bukan seperti satu lembar informasi.
 *
 * Pemisahnya sekarang garis `ink/15`, bukan `white/60`. Garis putih di atas
 * lembar kaca yang juga keputihan praktis tidak terlihat, jadi ketiga kolom
 * terbaca meleleh jadi satu blok — yang dibutuhkan justru batas yang tegas
 * antara satu parameter dan tetangganya.
 */
export default function ParameterStrip({
  reading,
  ammonia,
}: {
  reading: SensorReading | null;
  /** Kolom keempat: indeks risiko amonia untuk kondisi terukur (horizon 0).
   *  Datang dari backend, BUKAN dihitung ulang di browser — angkanya harus
   *  persis sama dengan baris yang tersimpan di log historis. */
  ammonia?: AmmoniaRisk | null;
}) {
  return (
    // 4 kolom, bukan 3: amonia duduk berdampingan dengan ketiga parameter yang
    // melahirkannya. Di layar sempit tetap menumpuk satu per baris.
    <div className="grid grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {PARAM_KEYS.map((param) => (
        <ParameterCell key={param} param={param} value={reading?.[param] ?? null} />
      ))}
      <AmmoniaCell mode="terkini" current={ammonia ?? null} />
    </div>
  );
}

/** Penanda nilai di atas track rentang. Satu-satunya tempat warna status masih
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
      {/* KEPALA: nama parameter kiri, status kanan. Statusnya di pojok, bukan
          di bawah angka — kalau semua kolom Aman, mata cukup menyapu satu
          kolom kanan alih-alih membaca tiga kali. */}
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
          {status ? (
            <>
              {/* Titik yang membawa warna, KATA yang membawa makna. Kata status
                  sengaja text-ink, bukan text-status-*: #B9740E (Waspada) di
                  atas latar terang cuma 3,77:1 dan gagal AA untuk ukuran ini.
                  Warnanya tidak hilang, cuma pindah ke titik yang memang tidak
                  perlu memenuhi ambang kontras teks. */}
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

      {/* Angka monospace: tiga kolom berdampingan, dan lebar digit yang tetap
          membuat koma ketiganya sejajar walau angkanya berganti tiap menit. */}
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold leading-none text-ink">
          {value != null ? formatValue(value) : "N/A"}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </p>

      {/* TRACK RENTANG. Batang = seluruh rentang toleransi; pita terang di
          dalamnya = rentang optimal; penanda = nilai sekarang. Yang didapat
          pembaca bukan cuma kata "Waspada", tapi SEBERAPA DEKAT ke tepi.
          Persentasenya dihitung rangePercent()/optimalBand() di lib/parameter.ts
          — satu skala untuk penanda dan pita, jadi keduanya tidak bisa saling
          bertentangan. Ini yang menggantikan sparkline: bentuk tren ada di
          Grafik pemantauan di bawah, posisi terhadap ambang tidak ada di mana
          pun kecuali di sini. */}
      <div className="mt-4">
        <div className="relative h-1.5 rounded-full bg-status-waspadaBg/80">
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-full bg-[#0F7078]/25"
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
