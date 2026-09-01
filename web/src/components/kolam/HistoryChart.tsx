"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { SensorReading } from "@/lib/types";
import { ParamKey, PARAM_UI, chartTickLabel, formatValue } from "@/lib/parameter";

export default function HistoryChart({
  data,
  parameter,
}: {
  data: SensorReading[];
  parameter: ParamKey;
}) {
  const cfg = PARAM_UI[parameter];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* data dipakai apa adanya — nama field SensorReading sudah jadi dataKey */}
        {/* left: 0 — margin negatif menggeser area plot dan memotong label
            sumbu Y. Ruangnya diatur lewat prop `width` di YAxis. */}
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${parameter}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" stroke="#DCE5DD" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={chartTickLabel}
            interval="preserveStartEnd"
            minTickGap={48}
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            formatter={(v: number) => [`${formatValue(v)} ${cfg.unit}`, cfg.short]}
            labelFormatter={(t: string) =>
              new Date(t).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            }
            contentStyle={{
              borderRadius: 10,
              borderColor: "#DCE5DD",
              fontSize: 12,
            }}
          />
          {/* connectNulls: satu pembacaan null tidak boleh memecah garis jadi titik */}
          <Area
            type="monotone"
            dataKey={parameter}
            connectNulls
            stroke={cfg.color}
            strokeWidth={2}
            fill={`url(#grad-${parameter})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
