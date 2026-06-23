"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENT_HEX, type Accent } from "@hamza/shared/ui/accent";

/** Rounded-top bar chart. Optionally stacks a second series. */
export function BarTrend({
  data,
  dataKey,
  xKey = "label",
  accent = "blue",
  height = 240,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey?: string;
  accent?: Accent;
  height?: number;
}) {
  const color = ACCENT_HEX[accent].icon;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
