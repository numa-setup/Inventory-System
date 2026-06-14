"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ACCENT_HEX, type Accent } from "@/components/ui/accent";

const ORDER: Accent[] = ["blue", "teal", "green", "amber", "purple", "coral"];

export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={ACCENT_HEX[ORDER[i % ORDER.length]].icon} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="tnum font-heading text-2xl font-bold text-text-primary">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-xs text-text-tertiary">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
