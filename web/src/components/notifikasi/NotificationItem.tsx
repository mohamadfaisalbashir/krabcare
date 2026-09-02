import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Notification, StatusLabel, WaterQualityCategory, categoryToLabel } from "@/lib/types";
import clsx from "clsx";

/** Label sumber notifikasi sesuai backend notification.source. */
const SOURCE_LABEL: Record<string, string> = {
  classification: "Kondisi Aktual",
  prediction: "Prediksi",
};

const STATUS_STYLE: Record<
  StatusLabel,
  { icon: React.ElementType; text: string; bg: string }
> = {
  Aman: { icon: CheckCircle2, text: "text-status-aman", bg: "bg-status-amanBg" },
  Waspada: {
    icon: AlertTriangle,
    text: "text-status-waspada",
    bg: "bg-status-waspadaBg",
  },
  Bahaya: {
    icon: AlertOctagon,
    text: "text-status-bahaya",
    bg: "bg-status-bahayaBg",
  },
};

export default function NotificationItem({
  item,
  onRead,
}: {
  item: Notification;
  onRead?: (id: number) => void;
}) {
  const label = categoryToLabel(item.quality_category as WaterQualityCategory);
  const style = STATUS_STYLE[label];
  const Icon = style.icon;

  return (
    <div className={clsx("flex gap-4 px-5 py-4", !item.is_read && "bg-brand-50/40")}>
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          style.bg,
          style.text
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-ink">
            {item.device_code ?? `Device #${item.device_id}`}
          </p>
          <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
            {SOURCE_LABEL[item.source] ?? item.source}
          </span>
          {!item.is_read && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-label="Belum dibaca" />
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink/80">{item.message}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <p className="text-xs text-muted">
            {new Date(item.created_at).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          {!item.is_read && onRead && (
            <button
              onClick={() => onRead(item.id)}
              className="py-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              Tandai dibaca
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
