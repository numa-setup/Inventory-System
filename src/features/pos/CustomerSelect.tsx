"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, User, Check } from "lucide-react";

interface Cust { id: string; name: string; phone: string | null }
const WALKIN: Cust = { id: "", name: "Walk-in customer", phone: null };

/** Searchable customer selector — type to filter by name/phone, walk-in pinned. */
export function CustomerSelect({
  customers, value, onChange,
}: {
  customers: Cust[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? customers.find((c) => c.id === value) : null;
  const label = selected ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}` : WALKIN.name;

  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const matches = t
      ? customers.filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? "").includes(t)).slice(0, 50)
      : customers.slice(0, 50);
    const showWalkin = !t || WALKIN.name.toLowerCase().includes(t);
    return showWalkin ? [WALKIN, ...matches] : matches;
  }, [customers, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    if (open) { setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
    else setQ("");
  }, [open]);

  function choose(id: string) { onChange(id); setOpen(false); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[active]; if (o) choose(o.id); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-2"
      >
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-text-tertiary" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-drawer">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder="Search name or phone…"
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto scrollbar-thin">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-tertiary">No customers found.</div>
            ) : options.map((o, i) => (
              <button
                type="button"
                key={o.id || "walkin"}
                onClick={() => choose(o.id)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm ${o.id ? "text-text-primary" : "font-medium text-text-primary"}`}>{o.name}</span>
                  {o.phone && <span className="block truncate text-xs text-text-tertiary">{o.phone}</span>}
                </span>
                {value === o.id && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
