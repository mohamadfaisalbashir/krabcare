import { StatusLabel } from "@/lib/types";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import clsx from "clsx";

const CONFIG: Record<
  StatusLabel,
  { text: string; bg: string; icon: React.ElementType }
> = {
  Aman: { text: "text-status-aman", bg: "bg-status-amanBg", icon: CheckCircle2 },
  Waspada: {
    text: "text-status-waspada",
    bg: "bg-status-waspadaBg",
    icon: AlertTriangle,
  },
  Bahaya: {
    text: "text-status-bahaya",
    bg: "bg-status-bahayaBg",
    icon: AlertOctagon,
  },
};

export default function StatusBadge({
  status,
  size = "md",
}: {
  status: StatusLabel;
  size?: "sm" | "md";
}) {
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        cfg.bg,
        cfg.text,
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.4} />
      {status}
    </span>
  );
}
