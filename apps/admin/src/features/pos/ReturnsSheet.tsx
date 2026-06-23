"use client";

import { useEffect, useState } from "react";
import { X, Search, Loader2, RotateCcw, Plus, Minus, AlertTriangle, Check } from "lucide-react";
import { Button } from "@hamza/shared/ui/Button";
import { Input } from "@hamza/shared/ui/Input";
import { Select } from "@hamza/shared/ui/Select";
import { useToast } from "@hamza/shared/ui/Toast";
import { cn, formatPKR } from "@hamza/shared/utils";
import { ensureCatalog } from "@/lib/catalog-cache";
import { getSaleForReturn, processReturn, type SaleForReturn } from "./returns";
import type { PayMethod } from "./actions";

const REFUND_METHODS: { m: PayMethod; label: string }[] = [
  { m: "CASH", label: "Cash" }, { m: "EASYPAISA", label: "Easypaisa" },
  { m: "JAZZCASH", label: "JazzCash" }, { m: "UDHAAR", label: "Adjust khata" },
];

export function ReturnsSheet({ open, onClose, initialReceipt }: { open: boolean; onClose: () => void; initialReceipt?: string }) {
  const toast = useToast();
  const [receiptNo, setReceiptNo] = useState("");
  const [sale, setSale] = useState<SaleForReturn | null>(null);
  const [qtys, setQtys] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // When opened from an invoice search result, prefill and auto-find.
  useEffect(() => {
    if (open && initialReceipt) { setReceiptNo(initialReceipt); void find(initialReceipt); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialReceipt]);

  if (!open) return null;

  function reset() {
    setReceiptNo(""); setSale(null); setQtys(new Map()); setReason(""); setMethod("CASH");
  }
  function close() { reset(); onClose(); }

  async function find(code?: string) {
    const rn = (code ?? receiptNo).trim();
    if (!rn) return;
    setLoading(true);
    const res = await getSaleForReturn(rn);
    setLoading(false);
    if ("error" in res) { setSale(null); return toast(res.error, "error"); }
    setSale(res);
    setQtys(new Map());
  }

  function setQty(id: string, qty: number, max: number) {
    setQtys((m) => {
      const next = new Map(m);
      const v = Math.max(0, Math.min(qty, max));
      if (v > 0) next.set(id, v); else next.delete(id);
      return next;
    });
  }

  const refundTotal = sale
    ? sale.items.reduce((s, it) => s + (qtys.get(it.sale_item_id) ?? 0) * it.unit_price, 0)
    : 0;

  async function submit() {
    if (!sale) return;
    const items = sale.items
      .filter((it) => (qtys.get(it.sale_item_id) ?? 0) > 0)
      .map((it) => ({
        sale_item_id: it.sale_item_id, product_id: it.product_id, variant_id: it.variant_id,
        qty: qtys.get(it.sale_item_id) as number, unit_price: it.unit_price, unit_cogs: it.unit_cogs,
      }));
    if (!items.length) return toast("Select item quantities to return", "error");
    setProcessing(true);
    const res = await processReturn({
      sale_id: sale.sale_id, receipt_no: sale.receipt_no, items, reason: reason || null,
      refund_method: method, customer_id: sale.customer_id,
      idempotency_key: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    });
    setProcessing(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    toast(`Refund ${formatPKR(refundTotal)} · stock returned`);
    void ensureCatalog({ force: true });
    close();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={processing ? undefined : close} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-drawer animate-fade-in sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 font-heading text-lg font-semibold text-text-primary"><RotateCcw className="h-5 w-5" /> Return / refund</span>
          <button onClick={close} disabled={processing} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && find()} placeholder="Receipt number, e.g. INV-12345678" className="pl-9" autoFocus />
            </div>
            <Button type="button" onClick={() => find()} disabled={loading} className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
            </Button>
          </div>

          {sale && (
            <>
              {!sale.within_window && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-icon/30 bg-amber-tile px-3 py-2 text-sm text-amber-text">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Outside the {sale.window_days}-day return window — this return will be blocked.
                </div>
              )}
              <div className="rounded-xl border border-border">
                {sale.items.map((it) => {
                  const q = qtys.get(it.sale_item_id) ?? 0;
                  return (
                    <div key={it.sale_item_id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">{it.name}</div>
                        <div className="text-xs text-text-tertiary">
                          {it.label ? `${it.label} · ` : ""}{formatPKR(it.unit_price)} · sold {it.qty}{it.returned > 0 ? ` · returned ${it.returned}` : ""}
                        </div>
                      </div>
                      {it.remaining <= 0 ? (
                        <span className="text-xs text-text-tertiary">fully returned</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQty(it.sale_item_id, q - 1, it.remaining)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border"><Minus className="h-3.5 w-3.5" /></button>
                          <span className="tnum w-7 text-center text-sm font-semibold">{q}</span>
                          <button onClick={() => setQty(it.sale_item_id, q + 1, it.remaining)} disabled={q >= it.remaining} className="flex h-7 w-7 items-center justify-center rounded-md border border-border disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Refund via</label>
                  <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                    {REFUND_METHODS.map((r) => <option key={r.m} value={r.m}>{r.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Reason</label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </>
          )}
        </div>

        {sale && (
          <div className="border-t border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-text-secondary">Refund total</span>
              <span className="tnum font-heading text-xl font-bold text-text-primary">{formatPKR(refundTotal)}</span>
            </div>
            <Button onClick={submit} disabled={processing || refundTotal <= 0 || !sale.within_window} className={cn("w-full py-3 text-base")}>
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Refund {formatPKR(refundTotal)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
