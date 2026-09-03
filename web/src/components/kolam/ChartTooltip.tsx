"use client";

import type { TooltipProps } from "recharts";
import { ParamKey, PARAM_UI, formatValue, statusOf } from "@/lib/parameter";

/**
 * Tooltip bersama kedua grafik halaman detail rak.
 *
 * Sebelumnya `contentStyle` + `labelFormatter` yang identik disalin di
 * HistoryChart dan CombinedChart — dua tempat yang harus diingat berbarengan
 * setiap kali gayanya diubah. Satu komponen menggantikan keduanya.
 *
 * Nilainya tidak cuma diangkakan: statusnya ikut dihitung dengan statusOf(),
 * fungsi yang sama yang dipakai kartu parameter dan StatusBadge. Jadi angka di
 * tooltip tidak pernah bisa mengatakan hal berbeda dari kartu di atasnya.
 */
export default function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="card min-w-[11rem] px-3 py-2.5 shadow-float">
      <p className="mb-2 text-xs font-semibold text-muted">
        {typeof label === "string"
          ? new Date(label).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : label}
      </p>
      <div className="space-y-1.5">
        {payload.map((row) => {
          const key = row.dataKey as ParamKey;
          const cfg = PARAM_UI[key];
          // Seri yang tidak dikenal (mis. garis bantu) dilewati, bukan bikin
          // crash lewat PARAM_UI[undefined].
          if (!cfg || typeof row.value !== "number") return null;
          const status = statusOf(key, row.value);
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: cfg.color }}
              />
              <span className="text-muted">{cfg.short}</span>
              <span className="ml-auto font-mono font-semibold text-ink">
                {formatValue(row.value)}
                <span className="ml-1 font-sans font-normal text-muted">
                  {cfg.unit}
                </span>
              </span>
              {/* Titik status, bukan kata: barisnya sudah padat. Maknanya tetap
                  tidak bergantung warna saja — title-nya terbaca pembaca layar
                  dan muncul saat kursor berhenti di atasnya. */}
              <span
                title={status}
                className={
                  status === "Aman"
                    ? "h-1.5 w-1.5 shrink-0 rounded-full bg-status-aman"
                    : status === "Waspada"
                      ? "h-1.5 w-1.5 shrink-0 rounded-full bg-status-waspada"
                      : "h-1.5 w-1.5 shrink-0 rounded-full bg-status-bahaya"
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
