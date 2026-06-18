"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, Banknote,
  Loader2, Package, ScanLine, Camera, CheckCircle2, AlertTriangle, RotateCcw,
  Keyboard, Pause, Clock, Play, WifiOff, RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { CustomerSelect } from "./CustomerSelect";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { cn, formatPKR } from "@/lib/utils";
import { useCatalog } from "@/lib/useCatalog";
import { ensureCatalog, type CatalogItem } from "@/lib/catalog-cache";
import { useScanHandler } from "@/components/scan/ScanProvider";
import { parseScan } from "@/lib/barcode";
import { beepOk, beepError } from "@/lib/sound";
import { CameraScanner } from "@/components/scan/CameraScannerLazy";
import { PaymentSheet } from "./PaymentSheet";
import { Receipt } from "./Receipt";
import { ReturnsSheet } from "./ReturnsSheet";
import { checkoutSale, type PaymentInput } from "./actions";
import { enqueueSale, getQueue, removeFromQueue, queueCount, type QueuedSalePayload } from "@/lib/pos-queue";
import { computeTotals } from "@/lib/pricing";
import { printReceipt, type ReceiptData } from "@/lib/receipt";

export interface StoreSettings {
  name: string;
  address?: string;
  phone?: string;
  ntn?: string;
  logo_url?: string;
  receipt_header?: string;
  receipt_footer?: string;
  tax_percent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- Hold / resume: parked carts persisted per-device in localStorage --------
interface HeldSale {
  id: string;
  ts: number;
  customerId: string;
  discount: string;
  lines: { p: PosProduct; qty: number }[];
}
const HELD_KEY = "hgs-held-sales";
function loadHeld(): HeldSale[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]") as HeldSale[]; } catch { return []; }
}
function saveHeld(h: HeldSale[]) {
  try { localStorage.setItem(HELD_KEY, JSON.stringify(h)); } catch { /* quota/full — ignore */ }
}

export interface PosProduct {
  variant_id: string;
  product_id: string;
  name: string;
  label: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number;
  available: number;
  category_id: string | null;
}

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
    cost: it.avg_cost || it.cost,
    available: it.available,
    category_id: it.category_id,
  };
}

export function PosClient({
  products: initialProducts, categories, barcodeIndex: initialBarcodeIndex, customers, store, cashierName,
}: {
  products: PosProduct[];
  categories: { id: string; name: string }[];
  barcodeIndex: Record<string, string>;
  customers: { id: string; name: string; phone: string | null }[];
  store: StoreSettings;
  cashierName: string;
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [held, setHeld] = useState<HeldSale[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const flushing = useRef(false);
  const idemKey = useRef("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScan, setLastScan] = useState<{ ok: boolean; text: string } | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.variant_id, p])), [products]);
  const byBarcode = useMemo(() => {
    const m = new Map<string, PosProduct>();
    for (const p of products) if (p.barcode) m.set(p.barcode, p);
    return m;
  }, [products]);

  function flash(ok: boolean, text: string) {
    setLastScan({ ok, text });
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setLastScan(null), 2200);
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (!t) return true;
      return p.name.toLowerCase().includes(t) || p.label.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.barcode ?? "").includes(t);
    });
  }, [products, q, cat]);

  // keep the keyboard highlight within the (re-filtered) grid
  useEffect(() => { setHighlight((h) => Math.min(h, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  // load parked carts (this device) once
  useEffect(() => { setHeld(loadHeld()); }, []);

  // open Returns prefilled when arriving from an invoice search (?receipt=…)
  const returnReceipt = useSearchParams().get("receipt") ?? undefined;
  useEffect(() => { if (returnReceipt) setReturnsOpen(true); }, [returnReceipt]);

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

  // Single resolve path for every input: hardware scanner, camera, or typed code.
  function handleScan(raw: string) {
    const parsed = parseScan(raw);
    const p =
      byBarcode.get(parsed.lookupKey) ||
      byBarcode.get(parsed.barcode) ||
      (barcodeIndex[parsed.lookupKey] ? byId.get(barcodeIndex[parsed.lookupKey]) : undefined) ||
      (barcodeIndex[parsed.barcode] ? byId.get(barcodeIndex[parsed.barcode]) : undefined);

    if (!p) {
      // not a known barcode — fall back to a unique text-search match
      const t = raw.trim().toLowerCase();
      const matches = products.filter(
        (x) => x.name.toLowerCase().includes(t) || x.sku.toLowerCase().includes(t) || (x.barcode ?? "").includes(t),
      );
      if (matches.length === 1) {
        add(matches[0]);
        setQ("");
        beepOk();
        flash(true, `Added ${matches[0].name}`);
        return;
      }
      beepError();
      flash(false, `Unknown code: ${parsed.barcode}`);
      return;
    }

    if (p.available <= 0) {
      beepError();
      flash(false, `${p.name} is out of stock`);
      return;
    }

    const qty = parsed.isWeightEmbedded && parsed.weight ? parsed.weight : 1;
    add(p, qty);
    setQ("");
    beepOk();
    flash(true, parsed.isWeightEmbedded ? `${p.name} · ${qty.toFixed(3)} kg` : `Added ${p.name}`);
  }

  function onScan(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (q.trim()) { handleScan(q); return; }
    const p = filtered[highlight]; // Enter on an empty box adds the highlighted card
    if (p && p.available > 0) { add(p); flash(true, `Added ${p.name}`); }
  }

  // Own scans while POS is open (the global scan-anywhere sheet is suppressed).
  // Fires only when no field is focused, so it never double-counts the search box.
  useScanHandler((code) => handleScan(code));

  const lines = [...cart.values()];
  const { subtotal, discount: disc, tax, total } = computeTotals(
    lines.map((l) => ({ qty: l.qty, unit_price: l.p.price, discount: 0 })),
    Number(discount) || 0,
    store.tax_percent,
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  // Margin guard: warn when the bill discount pushes the sale below total cost.
  const totalCost = lines.reduce((s, l) => s + (l.p.cost > 0 ? l.p.cost * l.qty : 0), 0);
  const belowCost = totalCost > 0 && subtotal - disc < totalCost;

  function openPayment() {
    if (!lines.length) return toast("Cart is empty", "error");
    idemKey.current = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setSheetOpen(false);
    setPaymentOpen(true);
  }

  async function checkout(payments: PaymentInput[], change: number) {
    if (!lines.length) return;
    const cartLines = lines; // snapshot for the receipt before we clear
    const cust = customers.find((c) => c.id === customerId) ?? null;
    const payload: QueuedSalePayload = {
      lines: cartLines.map((l) => ({
        variant_id: l.p.variant_id, product_id: l.p.product_id, qty: l.qty, unit_price: l.p.price,
        discount: 0,
      })),
      customer_id: customerId || null, payments, discount: Number(discount) || 0,
    };
    const makeReceipt = (receiptNo: string, sub: number, dis: number, tx: number, tot: number): ReceiptData => ({
      store: {
        name: store.name, address: store.address, phone: store.phone, logo_url: store.logo_url,
        header: store.receipt_header, footer: store.receipt_footer, ntn: store.ntn,
      },
      receipt_no: receiptNo,
      date: new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }),
      cashier: cashierName,
      customer: cust?.name ?? null,
      items: cartLines.map((l) => ({ name: l.p.name, label: l.p.label || undefined, qty: l.qty, unit_price: l.p.price, line_total: round2(l.p.price * l.qty) })),
      subtotal: sub, discount: dis, tax: tx, tax_percent: store.tax_percent, total: tot,
      payments, change,
    });

    setProcessing(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      const res = await checkoutSale({ ...payload, idempotency_key: idemKey.current });
      setProcessing(false);
      if ("error" in res) return toast(res.error, "error"); // real rejection — keep the cart
      finishSale(makeReceipt(res.receipt_no, res.subtotal, res.discount, res.tax, res.total));
      void ensureCatalog({ force: true });
      router.refresh();
    } catch {
      // network unreachable — queue locally and print a provisional receipt
      await enqueueSale({ idempotency_key: idemKey.current, ts: Date.now(), payload });
      setProcessing(false);
      finishSale(makeReceipt(`OFFLINE-${idemKey.current.slice(0, 8)}`, subtotal, disc, tax, total));
      void refreshQueue();
      toast("Offline — sale queued, will sync on reconnect", "error");
    }
  }

  function finishSale(receipt: ReceiptData) {
    setReceiptData(receipt);
    setLastReceipt(receipt); // kept for F6 after the modal closes
    setPaymentOpen(false);
    setCart(new Map()); setDiscount("");
  }

  async function refreshQueue() { setQueued(await queueCount()); }

  async function flushQueue() {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushing.current = true;
    try {
      for (const s of await getQueue()) {
        try {
          const res = await checkoutSale({ ...s.payload, idempotency_key: s.idempotency_key });
          await removeFromQueue(s.idempotency_key);
          if ("error" in res) toast(`A queued sale couldn't sync: ${res.error}`, "error");
        } catch {
          break; // still offline — leave the rest queued
        }
      }
    } finally {
      flushing.current = false;
      await refreshQueue();
      void ensureCatalog({ force: true });
      router.refresh();
    }
  }

  // Track connectivity and flush the queue on reconnect / load.
  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshQueue();
    void flushQueue();
    const goOnline = () => { setOnline(true); void flushQueue(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishReceipt() {
    setReceiptData(null);
    setCustomerId("");
    searchRef.current?.focus();
  }

  // ---- Hold / resume ----
  function holdSale() {
    if (!lines.length) return toast("Cart is empty", "error");
    const entry: HeldSale = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      ts: Date.now(),
      customerId,
      discount,
      lines: lines.map((l) => ({ p: l.p, qty: l.qty })),
    };
    const next = [entry, ...held];
    setHeld(next); saveHeld(next);
    setCart(new Map()); setDiscount(""); setCustomerId("");
    toast("Sale held");
    searchRef.current?.focus();
  }
  function resumeSale(id: string) {
    const entry = held.find((h) => h.id === id);
    if (!entry) return;
    let next = held.filter((h) => h.id !== id);
    // park the current cart first (if any) so nothing is lost
    if (cart.size) {
      next = [{
        id: crypto.randomUUID?.() ?? `${Date.now()}`,
        ts: Date.now(), customerId, discount,
        lines: lines.map((l) => ({ p: l.p, qty: l.qty })),
        }, ...next];
    }
    setHeld(next); saveHeld(next);
    setCart(new Map(entry.lines.map((l) => [l.p.variant_id, l])));
    setDiscount(entry.discount);
    setCustomerId(entry.customerId);
    setHeldOpen(false);
    searchRef.current?.focus();
  }
  function deleteHeld(id: string) {
    const next = held.filter((h) => h.id !== id);
    setHeld(next); saveHeld(next);
  }

  // ---- Keyboard shortcuts (full keyboard-only billing) ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const anyModal = paymentOpen || returnsOpen || cameraOpen || !!receiptData;

      switch (e.key) {
        case "F2": e.preventDefault(); searchRef.current?.focus(); return;
        case "F4": e.preventDefault(); if (!anyModal && cart.size) openPayment(); return;
        case "F6": e.preventDefault(); if (lastReceipt) printReceipt(lastReceipt); return;
        case "Escape":
          if (shortcutsOpen) return setShortcutsOpen(false);
          if (heldOpen) return setHeldOpen(false);
          if (!anyModal && cart.size) { setCart(new Map()); setDiscount(""); flash(false, "Sale cleared"); }
          return;
      }
      if (anyModal) return;
      if (e.key === "?" && !inField) { e.preventDefault(); setShortcutsOpen((s) => !s); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); return; }
      if ((e.key === "+" || e.key === "=") && (!inField || q === "")) { e.preventDefault(); const p = filtered[highlight]; if (p && p.available > 0) add(p, 1); return; }
      if ((e.key === "-" || e.key === "_") && (!inField || q === "")) { e.preventDefault(); const p = filtered[highlight]; if (p) add(p, -1); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOpen, returnsOpen, cameraOpen, receiptData, shortcutsOpen, heldOpen, cart, q, filtered, highlight, lastReceipt]);

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* product area */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onScan}
              placeholder="Scan barcode or search product…" className="h-12 pl-10 text-base" />
          </div>
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            title="Scan with camera"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Camera className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setReturnsOpen(true)}
            title="Return / refund"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-2"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setHeldOpen((o) => !o)}
            title="Held sales"
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Clock className="h-5 w-5" />
            {held.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{held.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
            className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-2 lg:flex"
          >
            <Keyboard className="h-5 w-5" />
          </button>
        </div>

        {/* offline / sync status */}
        {(!online || queued > 0) && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-icon/30 bg-amber-tile px-3 py-2 text-sm text-amber-text">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              {online
                ? `${queued} sale${queued !== 1 ? "s" : ""} waiting to sync`
                : `Offline — sales are queued${queued > 0 ? ` (${queued})` : ""} and will sync on reconnect`}
            </span>
            {online && queued > 0 && (
              <button onClick={() => flushQueue()} className="flex items-center gap-1 font-medium underline">
                <RefreshCw className="h-3.5 w-3.5" /> Sync now
              </button>
            )}
          </div>
        )}

        {/* per-scan confirmation / warning */}
        {lastScan && (
          <div className={cn(
            "mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm animate-fade-in",
            lastScan.ok
              ? "border-green-icon/30 bg-green-tile text-green-text"
              : "border-coral-icon/30 bg-coral-tile text-coral-text",
          )}>
            {lastScan.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="truncate">{lastScan.text}</span>
            <ScanLine className="ml-auto h-4 w-4 opacity-60" />
          </div>
        )}

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Chip active={cat === ""} onClick={() => setCat("")}>All</Chip>
          {categories.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>)}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-2">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-text-tertiary">No products match.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p, i) => {
                const inCart = cart.get(p.variant_id)?.qty ?? 0;
                const out = p.available <= 0;
                const isHighlight = i === highlight;
                return (
                  <div key={p.variant_id}
                    className={cn("group relative flex flex-col rounded-2xl border bg-surface p-3 text-left shadow-card transition-all",
                      out ? "border-border opacity-60" : "border-border hover:-translate-y-0.5 hover:shadow-drawer",
                      inCart > 0 && "ring-2 ring-brand-500",
                      isHighlight && inCart === 0 && "ring-2 ring-brand-300")}>
                    <button disabled={out} onClick={() => { setHighlight(i); add(p); }} className="flex flex-1 flex-col text-left disabled:cursor-not-allowed">
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
          lines={lines} subtotal={subtotal} discount={discount} setDiscount={setDiscount} total={total} tax={tax} taxPercent={store.tax_percent}
          belowCost={belowCost}
          customers={customers} customerId={customerId} setCustomerId={setCustomerId}
          setQty={setQty} remove={(id) => setQty(id, 0)} processing={processing} onCharge={openPayment} onHold={holdSale}
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
              lines={lines} subtotal={subtotal} discount={discount} setDiscount={setDiscount} total={total} tax={tax} taxPercent={store.tax_percent}
              belowCost={belowCost}
              customers={customers} customerId={customerId} setCustomerId={setCustomerId}
              setQty={setQty} remove={(id) => setQty(id, 0)} processing={processing} onCharge={openPayment} onHold={holdSale} embedded
            />
          </div>
        </div>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onResult={(code) => handleScan(code)}
        continuous
        title="Scan to add to cart"
      />

      <PaymentSheet
        open={paymentOpen}
        total={total}
        customers={customers}
        customerId={customerId}
        setCustomerId={setCustomerId}
        onClose={() => setPaymentOpen(false)}
        onConfirm={checkout}
        processing={processing}
      />

      <Receipt
        data={receiptData}
        customerPhone={customers.find((c) => c.id === customerId)?.phone}
        onClose={finishReceipt}
      />

      <ReturnsSheet open={returnsOpen} onClose={() => setReturnsOpen(false)} initialReceipt={returnReceipt} />

      {heldOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={() => setHeldOpen(false)} />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-drawer animate-fade-in sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="flex items-center gap-2 font-heading text-lg font-semibold text-text-primary"><Clock className="h-5 w-5" /> Held sales</span>
              <button onClick={() => setHeldOpen(false)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
              {held.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">No held sales</div>
              ) : held.map((h) => {
                const count = h.lines.reduce((s, l) => s + l.qty, 0);
                const amt = h.lines.reduce((s, l) => s + l.p.price * l.qty, 0);
                const cust = customers.find((c) => c.id === h.customerId);
                return (
                  <div key={h.id} className="flex items-center gap-2 rounded-xl border border-border p-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text-primary">{count} item{count !== 1 ? "s" : ""} · {formatPKR(amt)}</div>
                      <div className="text-xs text-text-tertiary">{cust ? `${cust.name} · ` : ""}{new Date(h.ts).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <Button size="sm" onClick={() => resumeSale(h.id)}><Play className="h-4 w-4" /> Resume</Button>
                    <button onClick={() => deleteHeld(h.id)} className="rounded-md p-2 text-text-tertiary hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShortcutsOpen(false)}>
          <div className="absolute inset-0 bg-black/45 animate-fade-in" />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface p-5 shadow-drawer animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 font-heading text-lg font-semibold text-text-primary"><Keyboard className="h-5 w-5" /> Shortcuts</span>
              <button onClick={() => setShortcutsOpen(false)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ["F2", "Focus product search"],
                ["F4", "Checkout (charge)"],
                ["F6", "Print last receipt"],
                ["Esc", "Clear current sale"],
                ["↑ ↓ ← →", "Move highlight"],
                ["Enter", "Add highlighted item"],
                ["+ / −", "Change its quantity"],
                ["?", "This help"],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="text-text-secondary">{d}</span>
                  <kbd className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-text-primary">{k}</kbd>
                </div>
              ))}
            </dl>
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
  lines, subtotal, discount, setDiscount, total, tax, taxPercent, belowCost,
  customers, customerId, setCustomerId, setQty, remove, processing, onCharge, onHold, embedded,
}: {
  lines: { p: PosProduct; qty: number }[];
  subtotal: number; discount: string; setDiscount: (v: string) => void; total: number;
  tax: number; taxPercent: number;
  belowCost: boolean;
  customers: { id: string; name: string; phone: string | null }[];
  customerId: string; setCustomerId: (v: string) => void;
  setQty: (id: string, qty: number) => void; remove: (id: string) => void;
  processing: boolean; onCharge: () => void; onHold: () => void; embedded?: boolean;
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
          <div key={l.p.variant_id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text-primary">{l.p.name}</div>
              <div className="text-xs text-text-tertiary">{l.p.label || l.p.sku} · {formatPKR(l.p.price)}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setQty(l.p.variant_id, l.qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-primary"><Minus className="h-3.5 w-3.5" /></button>
              <span className="tnum w-6 text-center text-sm font-semibold">{l.qty}</span>
              <button onClick={() => setQty(l.p.variant_id, l.qty + 1)} disabled={l.qty >= l.p.available} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-primary disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="tnum w-16 text-right text-sm font-medium text-text-primary">{formatPKR(l.p.price * l.qty)}</div>
            <button onClick={() => remove(l.p.variant_id)} className="rounded-md p-1 text-text-tertiary hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Subtotal</span><span className="tnum text-text-primary">{formatPKR(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Bill discount</span>
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-8 w-28 text-right" />
        </div>
        {tax > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Tax ({taxPercent}%)</span><span className="tnum text-text-primary">{formatPKR(tax)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-medium text-text-primary">Total</span>
          <span className="tnum font-heading text-xl font-bold text-text-primary">{formatPKR(total)}</span>
        </div>
        {belowCost && (
          <div className="flex items-center gap-1.5 rounded-lg bg-coral-tile px-2.5 py-1.5 text-xs font-medium text-coral-text">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> The bill discount puts this sale below its total cost.
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onHold} disabled={processing || !lines.length} className="shrink-0 px-4 py-3" title="Hold sale (park)">
            <Pause className="h-5 w-5" /> Hold
          </Button>
          <Button onClick={onCharge} disabled={processing || !lines.length} className="flex-1 py-3 text-base">
            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />} Charge {formatPKR(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
