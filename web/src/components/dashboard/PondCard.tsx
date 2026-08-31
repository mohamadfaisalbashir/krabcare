import Link from "next/link";
import { Droplets, Thermometer, FlaskConical, ChevronRight } from "lucide-react";
import { KolamDashboard, StatusLabel, categoryToLabel } from "@/lib/types";
import StatusBadge from "@/components/ui/StatusBadge";
import clsx from "clsx";

const STATUS_BORDER: Record<StatusLabel, string> = {
  Aman: "border-l-status-aman",
  Waspada: "border-l-status-waspada",
  Bahaya: "border-l-status-bahaya",
};

export default function PondCard({ item }: { item: KolamDashboard }) {
  const { kolam, quality, latestReading } = item;

  // null = belum ada klasifikasi (device belum diklaim / belum kirim data).
  // Jangan dipaksa jadi "Waspada" — itu bikin kolam kosong terlihat seperti anomali.
  const statusLabel: StatusLabel | null = quality?.classification
    ? categoryToLabel(quality.classification.quality_category)
    : null;

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
        "card group flex items-center justify-between border-l-4 p-5 transition hover:shadow-lg",
        statusLabel ? STATUS_BORDER[statusLabel] : "border-l-border"
      )}
    >
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2.5">
          <h3 className="truncate font-display text-base font-semibold text-ink">
            {kolam.nama}
          </h3>
          {statusLabel ? (
            <StatusBadge status={statusLabel} size="sm" />
          ) : (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-muted">
              Belum ada data
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5 font-mono">
            <FlaskConical className="h-3.5 w-3.5 text-brand-500" /> {latestReading?.ph ?? "—"} pH
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            <Thermometer className="h-3.5 w-3.5 text-brand-500" /> {latestReading?.temperature_c ?? "—"}°C
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            <Droplets className="h-3.5 w-3.5 text-brand-500" /> {latestReading?.salinity_ppt ?? "—"} ppt
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">Diperbarui {updated}</p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </Link>
  );
}
