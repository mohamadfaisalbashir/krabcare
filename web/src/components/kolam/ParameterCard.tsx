import Link from "next/link";
import { FlaskConical, Thermometer, Droplets, FileText } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { ParamKey, PARAM_UI, formatValue, statusOf } from "@/lib/parameter";

const ICON: Record<ParamKey, { icon: React.ElementType; tint: string }> = {
  ph: { icon: FlaskConical, tint: "bg-brand-50 text-brand-500" },
  temperature_c: { icon: Thermometer, tint: "bg-brass-100 text-brass-700" },
  salinity_ppt: { icon: Droplets, tint: "bg-brand-50 text-brand-300" },
};

export default function ParameterCard({
  param,
  value,
}: {
  param: ParamKey;
  value: number | null;
}) {
  const { label, unit } = PARAM_UI[param];
  const { icon: Icon, tint } = ICON[param];

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex-1 p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
          {value != null ? (
            <StatusBadge status={statusOf(param, value)} size="sm" />
          ) : (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-muted">
              Belum ada data
            </span>
          )}
        </div>

        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-semibold text-ink">
            {value != null ? formatValue(value) : "—"}
          </span>
          <span className="text-sm text-muted">{unit}</span>
        </p>
      </div>

      {/* Bawa parameter kartunya, kalau tidak halaman log jatuh ke fallback
          "ph" dan ketiga kartu bermuara ke tempat yang sama. */}
      <Link
        href={`/log-historis?param=${param}`}
        className="flex items-center justify-center gap-2 border-t border-border px-5 py-3 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
      >
        <FileText className="h-4 w-4" /> Akses Log Historis
      </Link>
    </div>
  );
}
