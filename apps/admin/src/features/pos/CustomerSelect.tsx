"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { User, Check, UserPlus, Loader2, X } from "lucide-react";

interface Cust { id: string; name: string; phone: string | null }

/** True for any stored row that is really the seeded walk-in placeholder, so it
 *  never shows up as a suggestion. */
function isWalkinRow(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, "");
  return n === "walkin" || n === "walkincustomer";
}

/**
 * Customer NAME field for the till (Part 3). A plain text input that shows
 * "Walk-in customer" as the placeholder when empty. As the cashier types, it
 * suggests matching saved customers (pick one to LINK the sale — needed for
 * udhaar/history). With no match, the typed name is used for this sale as a
 * free walk-in name, and can be saved as a new customer in one step.
 */
export function CustomerSelect({
  customers, name, customerId, onPick, onCreate,
}: {
  customers: Cust[];
  /** Current customer name (free text or a linked customer's name). */
  name: string;
  /** Linked customer id ("" when the name is a free walk-in). */
  customerId: string;
  /** Set the sale's customer name and (optional) linked id. */
  onPick: (name: string, customerId: string) => void;
  /** Persist the typed name as a new customer; returns the created row. */
  onCreate?: (name: string, phone: string | null) => Promise<Cust | null>;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const typed = name.trim();
  const real = useMemo(() => customers.filter((c) => !isWalkinRow(c.name)), [customers]);

  const matches = useMemo(() => {
    const t = typed.toLowerCase();
    if (!t) return [];
    return real
      .filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? "").includes(t))
      .slice(0, 8);
  }, [real, typed]);

  const exactMatch = useMemo(
    () => real.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase()),
    [real, typed],
  );
  // Offer "add as new" only when there's a typed name that isn't already saved.
  const canAdd = !!onCreate && typed.length > 0 && !exactMatch && !customerId;
  const showMenu = open && (matches.length > 0 || canAdd);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setAdding(false); } }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(c: Cust) { onPick(c.name, c.id); setOpen(false); setAdding(false); }
  function clear() { onPick("", ""); setOpen(false); setAdding(false); }

  async function createNow() {
    if (!onCreate || !typed) return;
    setCreating(true);
    const created = await onCreate(typed, newPhone.trim() || null);
    setCreating(false);
    setNewPhone("");
    if (created) { onPick(created.name, created.id); setOpen(false); setAdding(false); }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      if (matches.length > 0) { e.preventDefault(); pick(matches[active] ?? matches[0]); }
      else if (canAdd) { e.preventDefault(); setAdding(true); setTimeout(() => phoneRef.current?.focus(), 0); }
    } else if (e.key === "Escape") { setOpen(false); setAdding(false); }
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-1 focus-within:ring-brand-500">
        {customerId
          ? <Check className="h-4 w-4 shrink-0 text-green-text" />
          : <User className="h-4 w-4 shrink-0 text-text-tertiary" />}
        <input
          value={name}
          onChange={(e) => { onPick(e.target.value, ""); setOpen(true); setActive(0); setAdding(false); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Walk-in customer"
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        {name.length > 0 && (
          <button type="button" onClick={clear} title="Clear (walk-in)" className="shrink-0 text-text-tertiary hover:text-coral-text">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showMenu && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-drawer">
          <div className="max-h-60 overflow-y-auto scrollbar-thin">
            {matches.map((o, i) => (
              <button
                type="button"
                key={o.id}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text-primary">{o.name}</span>
                  {o.phone && <span className="block truncate text-xs text-text-tertiary">{o.phone}</span>}
                </span>
                {customerId === o.id && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
              </button>
            ))}

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
