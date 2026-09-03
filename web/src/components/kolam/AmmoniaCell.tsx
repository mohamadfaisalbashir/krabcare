"use client";

import clsx from "clsx";
import { AmmoniaRisk, StatusLabel } from "@/lib/types";
import {
  AMBANG,
  AMONIA_UI,
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
 * Bentuknya meniru tetangganya persis — nama di kiri, status di pojok kanan,
 * lalu isinya — supaya baris amonia terbaca sebagai kolom keempat dari
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
    <div className="px-1 py-4 sm:px-5 sm:py-3">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-ink">{AMONIA_UI.label}</p>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
          {isi.status ? (
            <>
              <span aria-hidden className={clsx("h-2 w-2 rounded-full", WARNA[isi.status])} />
              <span className="font-semibold text-ink">{isi.status}</span>
            </>
          ) : (
            <span className="text-muted">Belum ada data</span>
          )}
        </span>
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
  // penanda nilai (skalaPersen), jadi keduanya tidak bisa saling bertentangan —
  // aturan yang sama dengan optimalBand()/rangePercent() di parameter.ts.
  const lebarAman = skalaPersen(AMBANG.perhatian);
  const mulaiBahaya = skalaPersen(AMBANG.berbahaya);

  return {
    status,
    body: (
      <>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-semibold leading-none text-ink">
            {nilai != null ? formatFraksi(nilai) : "—"}
          </span>
          <span className="text-sm text-muted">{AMONIA_UI.unit}</span>
        </p>

        <div className="mt-4">
          <div className="relative h-1.5 rounded-full bg-status-waspadaBg/80">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-status-aman/25"
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
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            <span>0</span>
            <span className="text-status-aman">aman &lt; {AMBANG.perhatian}%</span>
            <span>{SKALA_MAKS}</span>
          </div>
        </div>

        {/* Peringatan ekstrapolasi. Hanya muncul kalau memang di luar envelope
            persamaannya (pH 7,8-8,3 / 5-35 °C / 5-35 ppt) — di dalam rentang,
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

function renderPrediksi(forecast: AmmoniaRisk[]): {
  status: StatusLabel | null;
  body: React.ReactNode;
} {
  // Jendela 3 jam, sama dengan HORIZON_MINUTES di PredictionPanel supaya kolom
  // amonia tidak bicara tentang rentang waktu yang berbeda dari tetangganya.
  const window = forecast
    .filter((f) => f.horizon_minutes <= 180 && f.fraction_nh3_pct != null)
    .sort((a, b) => a.horizon_minutes - b.horizon_minutes);

  if (window.length === 0) {
    return {
      status: null,
      body: (
        <>
          <div aria-hidden className="mt-3 h-0.5 rounded-full bg-ink/15" />
          <p className="mt-3 text-sm leading-relaxed text-ink">
            Belum ada data prediksi.
          </p>
        </>
      ),
    };
  }

  const terakhir = window[window.length - 1];
  const status = riskToStatus(terakhir.risk_level);
  const nilai = window.map((f) => f.fraction_nh3_pct as number);

  return {
    status,
    body: (
      <>
        <div
          aria-hidden
          className={clsx(
            "mt-3 h-0.5 rounded-full",
            status ? WARNA[status] : "bg-ink/15"
          )}
        />
        <p className="mt-3 text-sm leading-relaxed text-ink">{trenAmonia(nilai)}</p>
      </>
    ),
  };
}
