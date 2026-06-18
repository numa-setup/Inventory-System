"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, Receipt, FolderTree, Loader2 } from "lucide-react";
import { globalSearch, type SearchResults } from "@/features/search/actions";
import { formatPKR } from "@/lib/utils";

/** Topbar global instant search — products/SKU, invoices, categories. */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await globalSearch(term);
      setRes(r);
      setLoading(false);
      setOpen(true);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(url: string) { setOpen(false); setQ(""); setRes(null); router.push(url); }

  const has = res && (res.products.length || res.invoices.length || res.categories.length);

  return (
    <div className="relative hidden max-w-md flex-1 sm:block" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res && setOpen(true)}
        placeholder="Search products, SKU, invoices, categories…"
        className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
      />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-drawer scrollbar-thin">
          {loading && !res ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>
          ) : !has ? (
            <div className="px-3 py-3 text-sm text-text-tertiary">No matches</div>
          ) : (
            <>
              {res!.products.length > 0 && (
                <Section label="Products">
                  {res!.products.map((p) => (
                    <button key={p.variant_id} onClick={() => go(`/admin/products?q=${encodeURIComponent(p.sku)}`)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                      <Package className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{p.name}{p.label ? ` · ${p.label}` : ""}</span>
                      <span className="shrink-0 text-xs text-text-tertiary">{p.sku}</span>
                      <span className="shrink-0 tnum text-xs font-medium text-text-secondary">{formatPKR(p.price)}</span>
                    </button>
                  ))}
                </Section>
              )}
              {res!.categories.length > 0 && (
                <Section label="Categories">
                  {res!.categories.map((c) => (
                    <button key={c.id} onClick={() => go(`/admin/products?q=${encodeURIComponent(c.name)}`)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                      <FolderTree className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="flex-1 truncate text-sm text-text-primary">{c.name}</span>
                    </button>
                  ))}
                </Section>
              )}
              {res!.invoices.length > 0 && (
                <Section label="Invoices">
                  {res!.invoices.map((inv) => (
                    <button key={inv.id} onClick={() => go(`/admin/pos?receipt=${encodeURIComponent(inv.receipt_no)}`)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                      <Receipt className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="flex-1 truncate text-sm text-text-primary">{inv.receipt_no}</span>
                      <span className="shrink-0 text-xs text-text-tertiary">{new Date(inv.created_at).toLocaleDateString("en-PK")}</span>
                      <span className="shrink-0 tnum text-xs font-medium text-text-secondary">{formatPKR(inv.total)}</span>
                    </button>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</div>
      {children}
    </div>
  );
}
