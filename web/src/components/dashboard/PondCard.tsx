import Link from "next/link";
import { Droplets, Thermometer, FlaskConical, ArrowUpRight, Waves } from "lucide-react";
import { KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import clsx from "clsx";

/** Lebar kartu di dalam baris yang bisa digeser. Di layar 375px sisa ~100px
 *  kartu berikutnya masih terlihat — itu satu-satunya petunjuk bahwa barisnya
 *  bisa digeser, jadi jangan dibuat selebar layar. */
export const PONDCARD_WIDTH = "w-[17rem]";

/** Ubin ikon + titik status: dua-duanya ikut warna status, tapi label teksnya
 *  tetap ada di bawah — maknanya tidak pernah bergantung pada warna saja. */
const TONE: Record<StatusLabel, { tile: string; dot: string; text: string }> = {
  Aman: { tile: "bg-status-amanBg text-status-aman", dot: "bg-status-aman", text: "text-status-aman" },
  Waspada: { tile: "bg-status-waspadaBg text-status-waspada", dot: "bg-status-waspada", text: "text-status-waspada" },
  Bahaya: { tile: "bg-status-bahayaBg text-status-bahaya", dot: "bg-status-bahaya", text: "text-status-bahaya" },
};

const KOSONG = { tile: "bg-bg text-muted", dot: "bg-border", text: "text-muted" };

export default function PondCard({ item }: { item: KolamDashboard }) {
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
    <Link
      href={`/kolam/${kolam.id}`}
      className={clsx(
        PONDCARD_WIDTH,
        // shrink-0 wajib: tanpa ini flex akan memampatkan kartu agar muat,
        // bukan membiarkannya meluber untuk digeser.
        "card group shrink-0 snap-start p-4 transition duration-150",
        // Bayangan lebih tegas dari .card bawaan — kartu ini melayang di atas
        // foto banner, dan bayangan setipis .card tidak cukup memisahkannya.
        "shadow-[0_2px_12px_rgba(18,43,38,0.10)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(18,43,38,0.14)]"
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <span className={clsx("flex h-10 w-10 items-center justify-center rounded-lg", tone.tile)}>
          <Waves className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
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

      <div className="mt-3 flex items-center justify-between gap-1 border-t border-border pt-3 font-mono text-xs text-muted">
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
    </Link>
  );
}
