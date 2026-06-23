import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, format,
} from "date-fns";

export type Preset =
  | "today" | "yesterday" | "this_week" | "this_month" | "this_year"
  | "custom_date" | "custom_range";

export const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom_date", label: "Custom date" },
  { value: "custom_range", label: "Custom range" },
];

export interface DateRange { from: Date; to: Date; label: string; preset: Preset; }

const wopts = { weekStartsOn: 1 as const }; // Monday

/** Resolve a preset (+ optional custom strings YYYY-MM-DD) into a concrete range. */
export function resolveRange(preset?: string | null, fromStr?: string | null, toStr?: string | null): DateRange {
  const now = new Date();
  const p = (preset as Preset) || "this_month";
  switch (p) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Today", preset: p };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday", preset: p };
    }
    case "this_week":
      return { from: startOfWeek(now, wopts), to: endOfWeek(now, wopts), label: "This Week", preset: p };
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now), label: "This Year", preset: p };
    case "custom_date": {
      const d = fromStr ? new Date(fromStr) : now;
      return { from: startOfDay(d), to: endOfDay(d), label: format(d, "d MMM yyyy"), preset: p };
    }
    case "custom_range": {
      const f = fromStr ? new Date(fromStr) : startOfMonth(now);
      const t = toStr ? new Date(toStr) : now;
      return { from: startOfDay(f), to: endOfDay(t), label: `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}`, preset: p };
    }
    case "this_month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now), label: "This Month", preset: "this_month" };
  }
}

/** Bucket granularity for trend charts based on the range span. */
export function bucketOf(range: DateRange): "hour" | "day" | "month" {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 1.5) return "hour";
  if (days <= 92) return "day";
  return "month";
}

export function bucketKey(d: Date, bucket: "hour" | "day" | "month") {
  if (bucket === "hour") return format(d, "HH:00");
  if (bucket === "month") return format(d, "MMM yyyy");
  return format(d, "d MMM");
}
