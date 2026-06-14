import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_TILE, type Accent } from "./accent";
import { Card } from "./Card";

export function StatTile({
  label,
  value,
  icon: Icon,
  accent = "blue",
  delta,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  /** Percentage change; sign drives the up/down treatment. */
  delta?: number;
  hint?: string;
  className?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl",
            ACCENT_TILE[accent],
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              positive ? "bg-green-tile text-green-text" : "bg-coral-tile text-coral-text",
            )}
          >
            {positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="tnum font-heading text-2xl font-bold text-text-primary">
          {value}
        </div>
        <div className="mt-1 text-sm text-text-secondary">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-text-tertiary">{hint}</div>}
      </div>
    </Card>
  );
}
