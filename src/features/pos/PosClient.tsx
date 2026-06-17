"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, Banknote, NotebookPen,
  CreditCard, Loader2, Package,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { cn, formatPKR } from "@/lib/utils";
import { useCatalog } from "@/lib/useCatalog";
import { ensureCatalog, type CatalogItem } from "@/lib/catalog-cache";
import { checkoutSale } from "./actions";

export interface PosProduct {
  variant_id: string;
  product_id: string;
  name: string;
  label: string;
  sku: string;
  barcode: string | null;
  price: number;
  available: number;
  category_id: string | null;
}

type Pay = "CASH" | "UDHAAR" | "CARD";
function tone(p: PosProduct) { return p.available <= 0 ? "out_of_stock" : p.available <= 5 ? "low_stock" : "in_stock"; }

function toPos(it: CatalogItem): PosProduct {
  return {
    variant_id: it.variant_id,
    product_id: it.product_id,
    name: it.product_name,
    label: it.has_variants ? it.label : "",
    sku: it.sku,
    barcode: it.barcode,
    price: it.price,
    available: it.available,
    category_id: it.category_id,
  };
}

export function PosClient({
  products: initialProducts, categories, barcodeIndex: initialBarcodeIndex, customers,
}: {
  products: PosProduct[];
  categories: { id: string; name: string }[];
  barcodeIndex: Record<string, string>;
  customers: { id: string; name: string; phone: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();

  // Local catalogue cache: instant scan/search, live stock, works offline.
  // Falls back to the server-rendered props until the cache has hydrated.
  const snap = useCatalog();
  const products = useMemo(
    () => (snap ? snap.items.filter((i) => i.active).map(toPos) : initialProducts),
    [snap, initialProducts],
  );
  const barcodeIndex = useMemo(() => {
    if (!snap) return initialBarcodeIndex;
    const m: Record<string, string> = {};
    for (const it of snap.items) if (it.barcode) m[it.barcode] = it.variant_id;
    return m;
  }, [snap, initialBarcodeIndex]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState<Map<string, { p: PosProduct; qty: number }>>(new Map());
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.variant_id, p])), [products]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (!t) return true;
      return p.name.toLowerCase().includes(t) || p.label.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.barcode ?? "").includes(t);
    });
  }, [products, q, cat]);

  function add(p: PosProduct, delta = 1) {
    setCart((c) => {
      const next = new Map(c);
      const cur = next.get(p.variant_id)?.qty ?? 0;
      const qty = Math.max(0, cur + delta);
      if (qty === 0) next.delete(p.variant_id);
      else next.set(p.variant_id, { p, qty });
      return next;
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = new Map(c);
      const entry = next.get(id);
      if (!entry) return next;
      if (qty <= 0) next.delete(id); else next.set(id, { ...entry, qty });
      return next;
    });
  }

  function onScan(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = q.trim();
    const vid = barcodeIndex[code];
    if (vid && byId.get(vid)) { add(byId.get(vid)!); setQ(""); toast(`Added ${byId.get(vid)!.name}`); }
    else if (filtered.length === 1) { add(filtered[0]); setQ(""); }
  }

  const lines = [...cart.values()];
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const disc = Number(discount) || 0;
  const total = Math.max(subtotal - disc, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  async function checkout(method: Pay) {
    if (!lines.length) return toast("Cart is empty", "error");
    if (method === "UDHAAR" && !customerId) return toast("Pick a customer for udhaar", "error");
    setProcessing(true);
    const res = await checkoutSale({
      lines: lines.map((l) => ({ variant_id: l.p.variant_id, product_id: l.p.product_id, qty: l.qty, unit_price: l.p.price })),
      customer_id: customerId || null, payment_method: method, discount: disc,
      idempotency_key: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    });
    setProcessing(false);
    if (res?.error) return toast(res.error, "error");
    toast(`Sale complete · ${res.receipt_no ?? ""} · ${formatPKR(res.total ?? total)}`);
    setCart(new Map()); setDiscount(""); setCustomerId(""); setSheetOpen(false);
    void ensureCatalog({ force: true }); // reconcile stock after the deduction
    router.refresh();
    searchRef.current?.focus();
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      {/* product area */}
      <div className="flex min-h-0 flex-col">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onScan}
            placeholder="Scan barcode or search product…" className="h-12 pl-10 text-base" />
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Chip active={cat === ""} onClick={() => setCat("")}>All</Chip>
          {categories.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>)}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-2">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-text-tertiary">No products match.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => {
                const inCart = cart.get(p.variant_id)?.qty ?? 0;
                const out = p.available <= 0;
                return (
                  <div key={p.variant_id}
                    className={cn("group relative flex flex-col rounded-2xl border bg-surface p-3 text-left shadow-card transition-all",
                      out ? "border-border opacity-60" : "border-border hover:-translate-y-0.5 hover:shadow-drawer",
                      inCart > 0 && "ring-2 ring-brand-500")}>
                    <button disabled={out} onClick={() => add(p)} className="flex flex-1 flex-col text-left disabled:cursor-not-allowed">
                      <div className="mb-2 flex h-20 items-center justify-center rounded-xl bg-surface-2 text-text-tertiary">
                        <Package className="h-7 w-7" />
                      </div>
                      <h3 className="line-clamp-2 text-sm font-medium leading-tight text-text-primary">{p.name}</h3>
                      {p.label && <p className="mt-0.5 text-xs text-text-tertiary">{p.label}</p>}
                      <div className="mt-auto flex items-end justify-between pt-2">
                        <span className="tnum font-heading text-base font-bold text-text-primary">{formatPKR(p.price)}</span>
                        <StatusPill status={tone(p)} className="px-2 py-0.5 text-[10px]" />
                      </div>
                    </button>
                    {inCart > 0 && (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50/60 p-1">
                        <button onClick={() => add(p, -1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-text-primary shadow-sm"><Minus className="h-4 w-4" /></button>
                        <span className="tnum text-sm font-semibold text-text-primary">{inCart}</span>
                        <button onClick={() => add(p, 1)} disabled={inCart >= p.available} className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* desktop cart */}
      <div className="hidden lg:block">
        <CartPanel
          lines={lines} subtotal={subtotal} discount={discount} setDiscount={setDiscount} total={total}
          customers={customers} customerId={customerId} setCustomerId={setCustomerId}
          setQty={setQty} remove={(id) => setQty(id, 0)} processing={processing} checkout={checkout}
        />
      </div>

      {/* mobile cart trigger */}
      {count > 0 && (
        <button onClick={() => setSheetOpen(true)}
          className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-2xl bg-brand-500 px-5 py-3.5 text-white shadow-drawer lg:hidden">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> {count} item{count > 1 ? "s" : ""}</span>
          <span className="tnum font-heading text-lg font-bold">{formatPKR(total)}</span>
        </button>
      )}

      {/* mobile cart sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl bg-surface p-4 shadow-drawer">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-text-primary">Cart</h2>
              <button onClick={() => setSheetOpen(false)} className="rounded-lg p-2 text-text-tertiary hover:bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
            <CartPanel
              lines={lines} subtotal={subtotal} discount={discount} setDiscount={setDiscount} total={total}
              customers={customers} customerId={customerId} setCustomerId={setCustomerId}
              setQty={setQty} remove={(id) => setQty(id, 0)} processing={processing} checkout={checkout} embedded
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-surface text-text-secondary hover:bg-surface-2")}>
      {children}
    </button>
  );
}

function CartPanel({
  lines, subtotal, discount, setDiscount, total, customers, customerId, setCustomerId,
  setQty, remove, processing, checkout, embedded,
}: {
  lines: { p: PosProduct; qty: number }[];
  subtotal: number; discount: string; setDiscount: (v: string) => void; total: number;
  customers: { id: string; name: string; phone: string | null }[];
  customerId: string; setCustomerId: (v: string) => void;
  setQty: (id: string, qty: number) => void; remove: (id: string) => void;
  processing: boolean; checkout: (m: Pay) => void; embedded?: boolean;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border border-border bg-surface", embedded ? "max-h-[72vh]" : "h-full")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 font-heading font-semibold text-text-primary"><ShoppingCart className="h-4 w-4" /> Cart</span>
        <span className="text-xs text-text-tertiary">{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-6 text-center text-text-tertiary">
            <ShoppingCart className="h-8 w-8" /><p className="text-sm">Tap products to add them</p>
          </div>
        ) : lines.map((l) => (
          <div key={l.p.variant_id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text-primary">{l.p.name}</div>
              <div className="text-xs text-text-tertiary">{l.p.label || l.p.sku} · {formatPKR(l.p.price)}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setQty(l.p.variant_id, l.qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-primary"><Minus className="h-3.5 w-3.5" /></button>
              <span className="tnum w-6 text-center text-sm font-semibold">{l.qty}</span>
              <button onClick={() => setQty(l.p.variant_id, l.qty + 1)} disabled={l.qty >= l.p.available} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-primary disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="w-16 text-right tnum text-sm font-medium text-text-primary">{formatPKR(l.p.price * l.qty)}</div>
            <button onClick={() => remove(l.p.variant_id)} className="rounded-md p-1 text-text-tertiary hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walk-in customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
        </Select>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Subtotal</span><span className="tnum text-text-primary">{formatPKR(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Discount</span>
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-8 w-28 text-right" />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium text-text-primary">Total</span>
          <span className="tnum font-heading text-xl font-bold text-text-primary">{formatPKR(total)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => checkout("CASH")} disabled={processing || !lines.length} className="flex-col gap-0.5 py-2.5 text-xs">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Cash
          </Button>
          <Button onClick={() => checkout("UDHAAR")} disabled={processing || !lines.length} variant="secondary" className="flex-col gap-0.5 py-2.5 text-xs">
            <NotebookPen className="h-4 w-4" /> Udhaar
          </Button>
          <Button onClick={() => checkout("CARD")} disabled={processing || !lines.length} variant="secondary" className="flex-col gap-0.5 py-2.5 text-xs">
            <CreditCard className="h-4 w-4" /> Card
          </Button>
        </div>
      </div>
    </div>
  );
}
