"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import { AmmoniaRisk, StatusLabel } from "@/lib/types";
import {
  AMBANG,
  AMONIA_UI,
  LOG_PARAM_AMONIA,
  SKALA_MAKS,
  formatFraksi,
  riskToStatus,
  skalaPersen,
  trenAmonia,
} from "@/lib/ammonia";

/** Sama dengan MARKER/ACCENT di ParameterStrip & PredictionPanel: titik dan
 *  garis membawa warna, KATA yang membawa makna. */
const WARNA: Record<StatusLabel, string> = {
  Aman: "bg-status-aman",
  Waspada: "bg-status-waspada",
  Bahaya: "bg-status-bahaya",
};

/**
 * Kolom keempat di baris "Parameter" dan di baris "Prediksi".
 *
 * Satu komponen dua mode, bukan dua komponen: keduanya harus ikut berubah
 * bersamaan kalau istilah atau ambangnya diubah, dan dua salinan sudah pasti
 * membuat salah satunya ketinggalan.
 *
 * Bentuknya meniru tetangganya persis, nama di kiri, status di pojok kanan,
 * lalu isinya, supaya baris amonia terbaca sebagai kolom keempat dari
 * instrumen yang sama, bukan tempelan.
 */
export default function AmmoniaCell({
  mode,
  current,
  forecast,
}: {
  mode: "terkini" | "prediksi";
  current?: AmmoniaRisk | null;
  forecast?: AmmoniaRisk[];
}) {
  const isi =
    mode === "terkini"
      ? renderTerkini(current ?? null)
      : renderPrediksi(forecast ?? []);

  return (
    <div className="group px-1 py-4 sm:px-5 sm:py-3">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-ink">{AMONIA_UI.label}</p>
        {/* Badge status pojok kanan cuma untuk baris "Parameter" (terkini).
            Baris "Prediksi" tidak punya badge ini lagi, sama seperti ketiga
            kolom tetangganya di PredictionPanel, statusnya sekarang bulatan
            per horizon di dalam body. */}
        {mode === "terkini" && (
          <span className="ml-auto flex w-24 shrink-0 items-center gap-1.5 text-xs">
            {isi.status ? (
              <>
                <span aria-hidden className={clsx("h-2 w-2 rounded-full", WARNA[isi.status])} />
                <span className="font-semibold text-ink">{isi.status}</span>
              </>
            ) : (
              <span className="text-muted">Belum ada data</span>
            )}
          </span>
        )}
        {mode === "terkini" && (
          <Link
            href={`/log-historis?param=${LOG_PARAM_AMONIA}`}
            aria-label={`Log historis ${AMONIA_UI.short}`}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-white/60 hover:text-brand-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        )}
      </div>
      {isi.body}
    </div>
  );
}

function renderTerkini(risk: AmmoniaRisk | null): {
  status: StatusLabel | null;
  body: React.ReactNode;
} {
  const status = riskToStatus(risk?.risk_level);
  const nilai = risk?.fraction_nh3_pct ?? null;

  // Pita "optimal" = wilayah di bawah ambang perhatian. Skalanya satu dengan
  // penanda nilai (skalaPersen), jadi keduanya tidak bisa saling bertentangan,
  // aturan yang sama dengan optimalBand()/rangePercent() di parameter.ts.
  const lebarAman = skalaPersen(AMBANG.perhatian);
  const mulaiBahaya = skalaPersen(AMBANG.berbahaya);

  return {
    status,
    body: (
      <>
        {/* "%" polos, BUKAN AMONIA_UI.unit ("% dari TAN") -- unit penuh itu 5x
            lebih lebar daripada "pH"/"°C"/"ppt" di tiga parameter tetangganya,
            dan karena baris ini `justify-end` (rata kanan di mobile), unit
            yang jauh lebih lebar mendorong ANGKA BESARNYA jauh lebih ke kiri
            dibanding tiga parameter lain -- itulah kenapa keempat angka tidak
            pernah sejajar satu kolom saat ditumpuk di layar sempit. Makna
            "dari TAN"-nya tidak hilang: sudah ada di catatan/label bagian
            "Parameter" (AMONIA_DISCLAIMER) dan di label pita 0-X% di bawah. */}
        <p className="mt-3 flex items-baseline justify-end gap-1.5 sm:justify-start">
          <span className="font-mono text-3xl font-semibold leading-none text-ink">
            {nilai != null ? formatFraksi(nilai) : "N/A"}
          </span>
          <span className="text-sm text-muted">%</span>
        </p>

        <div className="mt-4">
          <div className="relative h-1.5 rounded-full bg-status-waspadaBg/80">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-[#0F7078]/25"
              style={{ width: `${lebarAman}%` }}
            />
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 rounded-full bg-status-bahaya/20"
              style={{ left: `${mulaiBahaya}%` }}
            />
            {nilai != null && status && (
              <span
                className={clsx(
                  "absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-500 ease-smooth motion-reduce:transition-none",
                  WARNA[status]
                )}
                style={{ left: `${skalaPersen(nilai)}%` }}
                title={`${formatFraksi(nilai)}% dari TAN`}
              />
            )}
          </div>
          <div className="mt-1 grid grid-cols-3 font-mono text-[10px] text-muted">
            <span className="text-left">0</span>
            <span className="text-center text-status-aman">
              0 s/d {formatFraksi(AMBANG.perhatian)}%
            </span>
            <span className="text-right">{SKALA_MAKS}</span>
          </div>
        </div>

        {/* Peringatan ekstrapolasi. Hanya muncul kalau memang di luar envelope
            persamaannya (pH 7,8-8,3 / 5-35 °C / 5-35 ppt), di dalam rentang,
            baris ini tidak ada dan kolomnya tetap serapi tetangganya. */}
        {risk && !risk.in_valid_range && (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Di luar rentang tervalidasi persamaan, angka ini hasil ekstrapolasi.
          </p>
        )}
      </>
    ),
  };
}

/** Sama tiga horizon dengan HORIZONS di PredictionPanel, supaya kolom amonia
 *  tidak bicara tentang rentang waktu yang berbeda dari tetangganya. */
const HORIZONS: readonly number[] = [15, 30, 60];

function renderPrediksi(forecast: AmmoniaRisk[]): {
  status: StatusLabel | null;
  body: React.ReactNode;
} {
  return {
    // Tidak ada satu status ringkasan lagi untuk kolom ini (lihat komentar di
    // PredictionPanel), badge di kepala kolom sudah disembunyikan untuk mode
    // prediksi, jadi field ini praktis tidak dipakai, dipertahankan cuma
    // supaya tipe kembaliannya tetap sama dengan renderTerkini.
    status: null,
    body: (
      <>
        {/* Garis aksen netral, sama seperti PredictionPanel: warnanya pindah
            jadi bulatan per horizon di bawah, bukan satu warna ringkasan. */}
        <div aria-hidden className="mt-3 h-0.5 rounded-full bg-ink" />

        <div className="mt-3 space-y-1.5">
          {HORIZONS.map((horizon) => {
            const row = forecast.find(
              (f) => f.horizon_minutes === horizon && f.fraction_nh3_pct != null
            );
            const nilai = row?.fraction_nh3_pct;
            const status = row ? riskToStatus(row.risk_level) : null;
            return (
              <p
                key={horizon}
                className="flex items-start gap-1.5 text-sm leading-relaxed text-ink"
              >
                <span
                  aria-hidden
                  className={clsx(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    status ? WARNA[status] : "bg-ink/15"
                  )}
                />
                <span>
                  <span className="font-medium">{horizon} menit:</span>{" "}
                  {typeof nilai === "number"
                    ? trenAmonia([nilai])
                    : "Belum ada data prediksi."}
                </span>
              </p>
            );
          })}
        </div>
      </>
    ),
  };
}
