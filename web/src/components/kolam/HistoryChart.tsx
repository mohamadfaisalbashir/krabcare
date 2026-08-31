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
import { ParamKey } from "@/lib/parameter";

const PARAM_CONFIG: Record<ParamKey, { label: string; color: string; unit: string }> = {
  ph: { label: "pH", color: "#0E6E5C", unit: "" },
  temperature_c: { label: "Suhu", color: "#C1873A", unit: "°C" },
  salinity_ppt: { label: "Salinitas", color: "#2B7A9E", unit: " ppt" },
};

export default function HistoryChart({
  data,
  parameter,
}: {
  data: SensorReading[];
  parameter: ParamKey;
}) {
  const cfg = PARAM_CONFIG[parameter];
  const chartData = data.map((d) => ({
    jam: new Date(d.time).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    nilai: d[parameter],
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${parameter}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" stroke="#DCE5DD" vertical={false} />
          <XAxis
            dataKey="jam"
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5C7A72" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            formatter={(v: number) => [`${v}${cfg.unit}`, cfg.label]}
            contentStyle={{
              borderRadius: 10,
              borderColor: "#DCE5DD",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="nilai"
            stroke={cfg.color}
            strokeWidth={2}
            fill={`url(#grad-${parameter})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
