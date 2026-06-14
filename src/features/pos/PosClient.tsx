"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Loader2, CheckCircle2, ScanLine, X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { cn, formatPKR } from "@/lib/utils";
import { checkoutSale, type CartLine } from "./actions";

export interface PosProduct {
  id: string; sku: string; name: string; base_unit: string; price: number; available: number;
}

interface CartItem extends PosProduct { qty: number }

export function PosClient({
  products, barcodeIndex, customers,
}: {
  products: PosProduct[];
  barcodeIndex: Record<string, string>;
  customers: { id: string; name: string; phone: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [payment, setPayment] = useState<"CASH" | "UDHAAR" | "CARD">("CASH");
  const [discount, setDiscount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ no: string; total: number } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scanRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t));
  }, [q, products]);

  function addToCart(p: PosProduct) {
    setCart((c) => {
      const found = c.find((x) => x.id === p.id);
      if (found) return c.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { ...p, qty: 1 }];
    });
  }

  function onScanEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = q.trim();
    const pid = barcodeIndex[code];
    if (pid) {
      const p = products.find((x) => x.id === pid);
      if (p) { addToCart(p); setQ(""); }
    } else if (filtered.length === 1) {
      addToCart(filtered[0]); setQ("");
    }
  }

  const setQty = (id: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((x) => x.id !== id) : c.map((x) => (x.id === id ? { ...x, qty } : x))));

  const subtotal = cart.reduce((s, x) => s + x.qty * x.price, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = subtotal - disc;

  async function checkout() {
    if (!cart.length) return;
    if (payment === "UDHAAR" && !customerId) { toast("Select a customer for udhaar.", "error"); return; }
    setSubmitting(true);
    const lines: CartLine[] = cart.map((x) => ({ product_id: x.id, qty: x.qty, unit_price: x.price }));
    const res = await checkoutSale({
      lines,
      customer_id: customerId || null,
      payment_method: payment,
      discount: disc,
      idempotency_key: crypto.randomUUID(),
    });
    setSubmitting(false);
    if (res?.error) { toast(res.error, "error"); return; }
    setLastReceipt({ no: res.receipt_no ?? "", total: res.total ?? total });
    setCart([]); setDiscount(""); setCustomerId(""); setPayment("CASH");
    toast(`Sale complete — ${formatPKR(res.total ?? total)}`);
    router.refresh();
    scanRef.current?.focus();
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
      {/* Catalogue */}
      <div className="flex min-h-0 flex-col">
        <div className="relative mb-3">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-500" />
          <input
            ref={scanRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onScanEnter}
            placeholder="Scan barcode or search product…"
            className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-3 text-base text-text-primary placeholder:text-text-tertiary focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto scrollbar-thin pr-1 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const out = p.available <= 0;
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className={cn(
                  "flex flex-col rounded-xl border border-border bg-surface p-3 text-left transition-all hover:border-brand-500 hover:shadow-card",
                  out && "opacity-60",
                )}
              >
                <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-surface-2 text-text-tertiary">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <span className="line-clamp-2 text-sm font-medium text-text-primary">{p.name}</span>
                <span className="mt-1 text-xs text-text-tertiary">{p.available} {p.base_unit}</span>
                <span className="mt-1 tnum font-heading font-bold text-brand-600">{formatPKR(p.price)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart */}
      <Card className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading font-semibold text-text-primary">
            <ShoppingCart className="h-5 w-5" /> Cart
            {cart.length > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{cart.length}</span>}
          </h2>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-coral-text hover:underline">Clear</button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-2">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-text-tertiary">
              {lastReceipt ? (
                <>
                  <CheckCircle2 className="mb-2 h-10 w-10 text-green-icon" />
                  <p className="font-medium text-text-primary">Sale complete</p>
                  <p className="text-sm">Receipt {lastReceipt.no} · {formatPKR(lastReceipt.total)}</p>
                  <p className="mt-2 text-xs">Scan to start the next sale.</p>
                </>
              ) : (
                <>
                  <ShoppingCart className="mb-2 h-10 w-10" />
                  <p className="text-sm">Scan or tap a product to start.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((x) => (
                <div key={x.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{x.name}</div>
                    <div className="text-xs text-text-tertiary">{formatPKR(x.price)} × {x.qty}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(x.id, x.qty - 1)} className="rounded-md border border-border p-1 hover:bg-surface-2"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="tnum w-7 text-center text-sm">{x.qty}</span>
                    <button onClick={() => setQty(x.id, x.qty + 1)} className="rounded-md border border-border p-1 hover:bg-surface-2"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="tnum w-20 text-right text-sm font-medium text-text-primary">{formatPKR(x.qty * x.price)}</div>
                  <button onClick={() => setQty(x.id, 0)} className="text-text-tertiary hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout panel */}
        <div className="space-y-3 border-t border-border p-4">
          <div className="grid grid-cols-2 gap-2">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Discount ₨" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["CASH", "UDHAAR", "CARD"] as const).map((m) => (
              <button key={m} onClick={() => setPayment(m)}
                className={cn("rounded-lg border py-2 text-sm font-medium transition-colors",
                  payment === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-text-secondary hover:bg-surface-2")}>
                {m === "UDHAAR" ? "Udhaar" : m === "CASH" ? "Cash" : "Card"}
              </button>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span className="tnum">{formatPKR(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-coral-text"><span>Discount</span><span className="tnum">−{formatPKR(disc)}</span></div>}
            <div className="flex justify-between font-heading text-lg font-bold text-text-primary"><span>Total</span><span className="tnum">{formatPKR(total)}</span></div>
          </div>

          <Button className="h-12 w-full text-base" disabled={!cart.length || submitting} onClick={checkout}>
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {submitting ? "Processing…" : `Charge ${formatPKR(total)}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
