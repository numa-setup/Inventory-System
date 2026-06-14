"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENT_HEX, type Accent } from "@/components/ui/accent";

/** Gradient-filled area chart, as in the dashboard references. */
export function AreaTrend({
  data,
  dataKey,
  xKey = "label",
  accent = "blue",
  height = 240,
  showAxes = true,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  accent?: Accent;
  height?: number;
  showAxes?: boolean;
}) {
  const color = ACCENT_HEX[accent].icon;
  const id = `area-${accent}-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {showAxes && (
          <>
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
              dy={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
              width={44}
            />
          </>
        )}
        <Tooltip
          cursor={{ stroke: color, strokeOpacity: 0.2 }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(16,24,40,.08)",
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${id})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
