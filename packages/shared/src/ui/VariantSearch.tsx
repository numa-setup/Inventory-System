"use client";

import { useMemo, useRef, useState } from "react";
import { Barcode } from "lucide-react";
import { Input } from "./Input";
import { formatNumber } from "../utils";

export interface VariantSearchItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  label: string;
  sku: string;
  barcode: string | null;
  cost: number;
  sale_price: number;
}

/**
 * Scan/search box that calls `onPick` for the chosen variant. Used to add line
 * items in receiving and purchase orders. An exact barcode match auto-picks.
 */
export function VariantSearch({
  items, onPick, exclude, placeholder = "Scan barcode or search to add…", autoFocus,
}: {
  items: VariantSearchItem[];
  onPick: (item: VariantSearchItem) => void;
  exclude?: Set<string>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    const pool = items.filter((i) => !exclude?.has(i.variant_id));
    if (!t) return pool.slice(0, 8);
    return pool.filter((i) =>
      i.product_name.toLowerCase().includes(t) ||
      i.label.toLowerCase().includes(t) ||
      i.sku.toLowerCase().includes(t) ||
      (i.barcode ?? "").includes(t),
    ).slice(0, 8);
  }, [items, term, exclude]);

  function pick(item: VariantSearchItem) {
    onPick(item);
    setTerm("");
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const exact = items.find((i) => i.barcode && i.barcode === term.trim());
      if (exact && !exclude?.has(exact.variant_id)) pick(exact);
      else if (results.length === 1) pick(results[0]);
    }
  }

  return (
    <div className="relative">
      <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <Input
        ref={ref}
        autoFocus={autoFocus}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9"
      />
      {focused && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-drawer">
          {results.map((r) => (
            <button
              key={r.variant_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className="flex w-full items-center justify-between border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{r.product_name}</div>
                <div className="truncate text-xs text-text-tertiary">{r.label} · {r.sku}{r.barcode ? ` · ${r.barcode}` : ""}</div>
              </div>
              <span className="tnum shrink-0 pl-2 text-xs text-text-tertiary">{formatNumber(r.cost)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
