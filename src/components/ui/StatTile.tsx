"use client";

import { useState } from "react";
import { type LucideIcon, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
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
  sensitive = false,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  /** Percentage change; sign drives the up/down treatment. */
  delta?: number;
  hint?: string;
  className?: string;
  /** When true the value is masked until the user clicks to reveal it.
   *  Reveal state is component-local, so it resets to hidden on every load. */
  sensitive?: boolean;
}) {
  const positive = (delta ?? 0) >= 0;
  const [revealed, setRevealed] = useState(false);
  const masked = sensitive && !revealed;

  return (
    <Card className={cn("overflow-hidden p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
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
      <div className="mt-4 min-w-0">
        {sensitive ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            title={masked ? "Click to reveal" : String(value)}
            aria-label={masked ? `Reveal ${label}` : `Hide ${label}`}
            className="group -ml-1 flex w-full max-w-full items-center gap-2 rounded-lg px-1 py-0.5 transition hover:bg-surface-2"
          >
            <span
              className={cn(
                "tnum min-w-0 flex-1 truncate text-left font-heading text-xl font-bold text-text-primary sm:text-2xl",
                masked && "select-none tracking-wider text-text-tertiary",
              )}
            >
              {masked ? "Rs ••••" : value}
            </span>
            {masked ? (
              <Eye className="h-4 w-4 shrink-0 text-text-tertiary opacity-70 group-hover:opacity-100" />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0 text-text-tertiary opacity-70 group-hover:opacity-100" />
            )}
          </button>
        ) : (
          <div className="tnum truncate font-heading text-xl font-bold text-text-primary sm:text-2xl" title={String(value)}>
            {value}
          </div>
        )}
        <div className="mt-1 truncate text-sm text-text-secondary">{label}</div>
        {hint && <div className="mt-0.5 truncate text-xs text-text-tertiary">{hint}</div>}
      </div>
    </Card>
  );
}
