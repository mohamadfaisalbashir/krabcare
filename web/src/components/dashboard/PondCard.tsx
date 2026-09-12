"use client";

import { Droplets, Thermometer, FlaskConical, ChevronDown, Waves, Wind } from "lucide-react";
import { KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import { formatFraksi } from "@/lib/ammonia";
import clsx from "clsx";

/** Lebar kartu saat mode rail. Jangan selebar layar: di 375px sisa ~100px
 *  kartu berikutnya adalah satu-satunya petunjuk barisnya bisa digeser.
 *  Mode grid memakai lebar kolomnya sendiri. */
export const PONDCARD_WIDTH = "w-[17rem]";

/** Ubin ikon + titik status. Keduanya ikut warna status, tapi label teksnya
 *  tetap ada supaya maknanya tidak bergantung pada warna saja. */
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
  /** grid = mengisi lebar kolomnya (tata letak awal). rail = lebar tetap dan
   *  bisa digeser, dipakai saat satu rak dipilih dan detailnya terbuka. */
  variant: "grid" | "rail";
  selected: boolean;
  /** id panel detail untuk aria-controls, supaya pembaca layar tahu tombol ini
   *  membuka panel yang mana. */
  panelId: string;
  onSelect: (kolamId: number) => void;
}) {
  const { kolam, quality, latestReading, ammonia } = item;

  // null = belum ada klasifikasi (device belum diklaim atau belum kirim data).
  // Jangan dipaksa jadi "Waspada", kolam kosong bukan anomali.
  const statusLabel: StatusLabel | null = quality?.classification
    ? categoryToLabel(quality.classification.quality_category)
    : null;
  const tone = statusLabel ? TONE[statusLabel] : KOSONG;

  const updated = latestReading
    ? new Date(latestReading.time).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "N/A";

  return (
    // <button>, bukan <Link>: detail rak terbuka di bawah kartu ini, bukan di
    // halaman lain, jadi tautan menjanjikan perpindahan yang tidak terjadi.
    <button
      type="button"
      onClick={() => onSelect(kolam.id)}
      aria-expanded={selected}
      aria-controls={panelId}
      // aria-expanded sendirian cuma berbunyi "diciutkan", tanpa menyebut apa
      // yang akan terbentang. Label ini yang menyebutnya.
      aria-label={`${kolam.nama}, ${selected ? "tutup" : "buka"} detail kolam`}
      // Dipakai dashboard untuk menggulirkan kartu terpilih ke tengah rail.
      data-pondcard={kolam.id}
      className={clsx(
        "glass group p-4 text-left transition duration-200",
        variant === "rail"
          ? // shrink-0 wajib: tanpa ini flex memampatkan kartu agar muat, bukan
            // membiarkannya meluber untuk digeser.
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
        {/* Chevron ke bawah, bukan panah keluar: detailnya terbuka di bawah
            kartu, bukan di halaman lain. */}
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
          garis terang terbaca sebagai tepi lempeng. */}
      <div className="mt-3 flex items-center justify-between gap-1 border-t border-white/70 pt-3 font-mono text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <FlaskConical className="h-3.5 w-3.5 text-[#1C6970]" />
          {latestReading?.ph ?? "N/A"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Thermometer className="h-3.5 w-3.5 text-[#1C6970]" />
          {latestReading?.temperature_c ?? "N/A"}°
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplets className="h-3.5 w-3.5 text-[#1C6970]" />
          {latestReading?.salinity_ppt ?? "N/A"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Wind className="h-3.5 w-3.5 text-[#1C6970]" />
          {ammonia?.fraction_nh3_pct != null ? `${formatFraksi(ammonia.fraction_nh3_pct)}%` : "N/A"}
        </span>
      </div>
    </button>
  );
}
