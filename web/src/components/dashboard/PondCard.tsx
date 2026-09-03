"use client";

import { Droplets, Thermometer, FlaskConical, ChevronDown, Waves } from "lucide-react";
import { KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import clsx from "clsx";

/** Lebar kartu SAAT MODE RAIL. Di layar 375px sisa ~100px kartu berikutnya
 *  masih terlihat — itu satu-satunya petunjuk bahwa barisnya bisa digeser, jadi
 *  jangan dibuat selebar layar. Mode grid memakai lebar kolomnya sendiri. */
export const PONDCARD_WIDTH = "w-[17rem]";

/** Ubin ikon + titik status: dua-duanya ikut warna status, tapi label teksnya
 *  tetap ada di bawah — maknanya tidak pernah bergantung pada warna saja. */
const TONE: Record<StatusLabel, { tile: string; dot: string; text: string }> = {
  Aman: { tile: "bg-status-amanBg text-status-aman", dot: "bg-status-aman", text: "text-status-aman" },
  Waspada: { tile: "bg-status-waspadaBg text-status-waspada", dot: "bg-status-waspada", text: "text-status-waspada" },
  Bahaya: { tile: "bg-status-bahayaBg text-status-bahaya", dot: "bg-status-bahaya", text: "text-status-bahaya" },
};

const KOSONG = { tile: "bg-white/50 text-muted", dot: "bg-border", text: "text-muted" };

export default function PondCard({
  item,
  variant,
  selected,
  panelId,
  onSelect,
}: {
  item: KolamDashboard;
  /** grid = mengisi lebar kolomnya (tata letak awal, mengisi ruang kosong);
   *  rail = lebar tetap & bisa digeser, dipakai begitu satu rak dipilih dan
   *  detailnya terbuka di bawah. */
  variant: "grid" | "rail";
  selected: boolean;
  /** id panel detail, untuk aria-controls — tanpa itu hubungan tombol ke panel
   *  yang dibukanya tidak ada sama sekali bagi pembaca layar. */
  panelId: string;
  onSelect: (kolamId: number) => void;
}) {
  const { kolam, quality, latestReading } = item;

  // null = belum ada klasifikasi (device belum diklaim / belum kirim data).
  // Jangan dipaksa jadi "Waspada" — itu bikin kolam kosong terlihat seperti anomali.
  const statusLabel: StatusLabel | null = quality?.classification
    ? categoryToLabel(quality.classification.quality_category)
    : null;
  const tone = statusLabel ? TONE[statusLabel] : KOSONG;

  const updated = latestReading
    ? new Date(latestReading.time).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    // <button>, bukan <Link>: detail rak tidak lagi punya halaman sendiri, ia
    // terbuka DI BAWAH kartu ini. Tautan akan menjanjikan perpindahan halaman
    // yang tidak pernah terjadi.
    <button
      type="button"
      onClick={() => onSelect(kolam.id)}
      aria-expanded={selected}
      aria-controls={panelId}
      // Dipakai dashboard untuk menggulirkan kartu terpilih ke tengah rail.
      data-pondcard={kolam.id}
      className={clsx(
        "glass group p-4 text-left transition duration-200",
        variant === "rail"
          ? // shrink-0 wajib: tanpa ini flex akan memampatkan kartu agar muat,
            // bukan membiarkannya meluber untuk digeser.
            `${PONDCARD_WIDTH} shrink-0`
          : "w-full",
        selected
          ? "bg-white/75 ring-2 ring-brand-500/60"
          : "hover:-translate-y-0.5 hover:bg-white/70"
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className={clsx("flex h-10 w-10 items-center justify-center rounded-lg", tone.tile)}>
          <Waves className="h-5 w-5" strokeWidth={2.2} />
        </span>
        {/* Chevron ke BAWAH, bukan panah keluar: detailnya memang terbuka di
            bawah kartu, bukan di halaman lain. */}
        <ChevronDown
          className={clsx(
            "h-4 w-4 transition duration-300 ease-smooth motion-reduce:transition-none",
            selected ? "rotate-180 text-brand-600" : "text-muted group-hover:text-brand-600"
          )}
          strokeWidth={2.2}
        />
      </div>

      <h3 className="truncate font-display text-sm font-semibold text-ink">
        {kolam.nama}
      </h3>

      <p className="mt-1 flex items-center gap-1.5 text-xs">
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
        <span className={clsx("font-medium", tone.text)}>
          {statusLabel ?? "Belum ada data"}
        </span>
        <span className="text-muted">· {updated}</span>
      </p>

      {/* Garis pemisah putih, bukan `border-border` yang keabuan: di atas kaca,
          garis terang terbaca sebagai tepi lempeng, garis abu jadi kotor. */}
      <div className="mt-3 flex items-center justify-between gap-1 border-t border-white/70 pt-3 font-mono text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <FlaskConical className="h-3.5 w-3.5 text-brand-500" />
          {latestReading?.ph ?? "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Thermometer className="h-3.5 w-3.5 text-brand-500" />
          {latestReading?.temperature_c ?? "—"}°
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplets className="h-3.5 w-3.5 text-brand-500" />
          {latestReading?.salinity_ppt ?? "—"}
        </span>
      </div>
    </button>
  );
}
