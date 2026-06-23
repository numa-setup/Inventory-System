"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type LucideIcon, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
import { cn } from "../utils";
import { ACCENT_TILE, type Accent } from "./accent";
import { Card } from "./Card";

// Measure-then-paint on the client; falls back to a plain effect during SSR to
// avoid React's useLayoutEffect-on-server warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Renders a single line of text that auto-shrinks its font size so the whole
 * value always fits the available width — never truncated with an ellipsis.
 * Width is measured against the parent element, so the parent must constrain
 * the width (e.g. `min-w-0 flex-1`).
 */
function FitText({
  children,
  className,
  max = 24,
  min = 12,
}: {
  children: React.ReactNode;
  className?: string;
  /** Largest font size in px (the natural/desired size). */
  max?: number;
  /** Smallest font size in px before we stop shrinking. */
  min?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  useIsoLayoutEffect(() => {
    const span = ref.current;
    const parent = span?.parentElement;
    if (!span || !parent) return;
    const fit = () => {
      // Measure at the natural size, then scale down proportionally to fit.
      span.style.fontSize = `${max}px`;
      const available = parent.clientWidth;
      const needed = span.scrollWidth;
      if (!available || !needed) return;
      const next =
        needed > available ? Math.max(min, Math.floor((max * available) / needed)) : max;
      span.style.fontSize = `${next}px`;
      setSize(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  });

  return (
    <span
      ref={ref}
      className={cn("block whitespace-nowrap", className)}
      style={{ fontSize: size, lineHeight: 1.15 }}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  fullValue,
  icon: Icon,
  accent = "blue",
  delta,
  hint,
  className,
  sensitive = false,
}: {
  label: string;
  value: string | number;
  /** Exact, non-abbreviated figure shown when a sensitive tile is revealed.
   *  Falls back to `value` when omitted. */
  fullValue?: string | number;
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
  const shown = fullValue ?? value;

  return (
    <Card className={cn("overflow-hidden p-5", className)}>
      {/* Top row: pastel icon tile on the left, eye toggle (sensitive) or delta
          badge on the right — they never sit on the same line as the value. */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            ACCENT_TILE[accent],
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
        {sensitive ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            title={masked ? "Click to reveal" : "Click to hide"}
            aria-label={masked ? `Reveal ${label}` : `Hide ${label}`}
            aria-pressed={revealed}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition hover:bg-surface-2 hover:text-text-secondary"
          >
            {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        ) : (
          delta !== undefined && (
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
          )
        )}
      </div>
      {/* Value area: its own line, full width, nothing overlapping it. */}
      <div className="mt-4 min-w-0">
        <div className="min-w-0" title={masked ? undefined : String(shown)}>
          {masked ? (
            <span className="tnum block select-none whitespace-nowrap font-heading text-xl font-bold tracking-wider text-text-tertiary sm:text-2xl">
              Rs ••••
            </span>
          ) : (
            <FitText className="tnum font-heading font-bold text-text-primary">{shown}</FitText>
          )}
        </div>
        <div className="mt-1 truncate text-sm text-text-secondary">{label}</div>
        {hint && <div className="mt-0.5 truncate text-xs text-text-tertiary">{hint}</div>}
      </div>
    </Card>
  );
}
