"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, User, Check, UserPlus, Loader2 } from "lucide-react";

interface Cust { id: string; name: string; phone: string | null }
const WALKIN: Cust = { id: "", name: "Walk-in customer", phone: null };

/** True for any stored row that is really the walk-in placeholder, so it never
 *  shows as a duplicate alongside the pinned synthetic Walk-in option. */
function isWalkinRow(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "");
  return n === "walkin" || n === "walkincustomer";
}

/**
 * Single search-or-add customer field for the till (Part 3). Defaults to
 * "Walk-in customer"; type a name/phone to pick an existing customer, or — when
 * nothing matches — add the typed name as a new customer (with optional phone)
 * inline and select them in one step.
 */
export function CustomerSelect({
  customers, value, onChange, onCreate,
}: {
  customers: Cust[];
  value: string;
  onChange: (id: string) => void;
  /** Create a customer inline; returns the created row (or null on failure). */
  onCreate?: (name: string, phone: string | null) => Promise<Cust | null>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const selected = value ? customers.find((c) => c.id === value) : null;
  const label = selected ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}` : WALKIN.name;

  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const real = customers.filter((c) => !isWalkinRow(c.name));
    const matches = t
      ? real.filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? "").includes(t)).slice(0, 50)
      : real.slice(0, 50);
    const showWalkin = !t || WALKIN.name.toLowerCase().includes(t);
    return showWalkin ? [WALKIN, ...matches] : matches;
  }, [customers, q]);

  // Offer "add" only when the typed name doesn't already exist.
  const typed = q.trim();
  const exactMatch = useMemo(
    () => customers.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase()),
    [customers, typed],
  );
  const canAdd = !!onCreate && typed.length > 0 && !exactMatch;

  async function createNow() {
    if (!onCreate || !typed) return;
    setCreating(true);
    const created = await onCreate(typed, newPhone.trim() || null);
    setCreating(false);
    if (created) { onChange(created.id); setOpen(false); }
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    if (open) { setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
    else { setQ(""); setAdding(false); setNewPhone(""); }
  }, [open]);

  function choose(id: string) { onChange(id); setOpen(false); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // Enter selects a match if there is one, else falls through to "add".
      if (options.length > 0) choose(options[active]?.id ?? "");
      else if (canAdd) { setAdding(true); setTimeout(() => phoneRef.current?.focus(), 0); }
    }
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
            {options.length === 0 && !canAdd ? (
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

            {/* Add the typed name as a new customer (with optional phone). */}
            {canAdd && (
              adding ? (
                <div className="border-t border-border p-2">
                  <div className="px-1 pb-1.5 text-xs text-text-tertiary">
                    New customer · <span className="font-medium text-text-primary">{typed}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={phoneRef}
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createNow(); } else if (e.key === "Escape") { e.preventDefault(); setAdding(false); } }}
                      placeholder="Phone (optional)"
                      className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => void createNow()}
                      disabled={creating}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAdding(true); setTimeout(() => phoneRef.current?.focus(), 0); }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-brand-600 hover:bg-surface-2"
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  Add <span className="font-medium">“{typed}”</span> as a new customer
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
