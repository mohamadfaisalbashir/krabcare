import { StatusLabel } from "@/lib/types";
import StatusBadge from "@/components/ui/StatusBadge";
import clsx from "clsx";

const RING_COLOR: Record<StatusLabel, string> = {
  Aman: "stroke-status-aman",
  Waspada: "stroke-status-waspada",
  Bahaya: "stroke-status-bahaya",
};

export default function ParameterGauge({
  label,
  value,
  unit,
  status,
  rentangOptimal,
  percentOfRange,
}: {
  label: string;
  value: number;
  unit: string;
  status: StatusLabel;
  rentangOptimal: string;
  /** 0-100, posisi nilai relatif terhadap rentang toleransi (untuk visual ring) */
  percentOfRange: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (Math.min(100, Math.max(0, percentOfRange)) / 100) * circumference;

  return (
    <div className="card flex flex-col items-center gap-3 p-5 text-center">
      <p className="text-sm font-medium text-muted">{label}</p>

      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg width="112" height="112" className="-rotate-90">
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-border"
            strokeWidth="8"
          />
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={clsx(RING_COLOR[status], "transition-all duration-500")}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="font-mono text-2xl font-semibold text-ink">
            {value}
          </span>
          <span className="text-xs text-muted">{unit}</span>
        </div>
      </div>

      <StatusBadge status={status} size="sm" />
      <p className="text-xs text-muted">Optimal: {rentangOptimal}</p>
    </div>
  );
}
