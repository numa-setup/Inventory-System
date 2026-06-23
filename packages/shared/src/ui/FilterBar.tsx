"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Select } from "./Select";
import { Input } from "./Input";
import { PRESETS } from "../dates";
import { cn } from "../utils";

export interface DimensionFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Reusable URL-driven filter bar: date presets (Today / Yesterday / This Week /
 * This Month / This Year / Custom date / Custom range) plus optional dimension
 * selects. Updates the query string; the server re-renders with the new range.
 * Shared by every report and list screen.
 */
export function FilterBar({
  dimensions = [],
  className,
  compact,
}: {
  dimensions?: DimensionFilter[];
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const preset = params.get("preset") ?? "this_month";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-text-tertiary" />
        <Select
          value={preset}
          onChange={(e) => update({ preset: e.target.value, from: null, to: null })}
          className={cn(compact ? "h-9" : "", "w-40")}
        >
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </div>

      {preset === "custom_date" && (
        <Input type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="w-44" />
      )}
      {preset === "custom_range" && (
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
          <span className="text-text-tertiary">–</span>
          <Input type="date" value={to} onChange={(e) => update({ to: e.target.value })} className="w-40" />
        </div>
      )}

      {dimensions.length > 0 && <div className="hidden h-6 w-px bg-border sm:block" />}

      {dimensions.map((d) => (
        <Select
          key={d.key}
          value={params.get(d.key) ?? ""}
          onChange={(e) => update({ [d.key]: e.target.value || null })}
          className="w-44"
        >
          <option value="">{d.label}</option>
          {d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ))}
    </div>
  );
}
