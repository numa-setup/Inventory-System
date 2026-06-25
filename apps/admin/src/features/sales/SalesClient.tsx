"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, Receipt as ReceiptIcon, RotateCcw, Printer, User, CalendarClock, ChevronRight, Trash2 } from "lucide-react";
import { PageHeader } from "@hamza/shared/ui/PageHeader";
import { Input } from "@hamza/shared/ui/Input";
import { Button } from "@hamza/shared/ui/Button";
import { Drawer } from "@hamza/shared/ui/Drawer";
import { StatusPill } from "@hamza/shared/ui/StatusPill";
import { ConfirmDialog } from "@hamza/shared/ui/ConfirmDialog";
import { useToast } from "@hamza/shared/ui/Toast";
import { formatPKR } from "@hamza/shared/utils";
import { ReturnsSheet } from "@/features/pos/ReturnsSheet";
import { Receipt } from "@/features/pos/Receipt";
import type { ReceiptData } from "@/lib/receipt";
import { getSalesPage, getSaleDetail, getSaleReceiptData, deleteReturnedSale, type SalesListRow, type SaleDetail } from "./actions";

const PAGE = 25;
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SalesClient({ initial, isOwner = false }: { initial: { rows: SalesListRow[]; hasMore: boolean }; isOwner?: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<SalesListRow[]>(initial.rows);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [returnFor, setReturnFor] = useState<string | null>(null); // receipt_no
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await getSalesPage({ search, limit: PAGE, offset: 0 });
      setRows(res.rows); setHasMore(res.hasMore); setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function loadMore() {
    setLoading(true);
    const res = await getSalesPage({ search, limit: PAGE, offset: rows.length });
    setRows((r) => [...r, ...res.rows]); setHasMore(res.hasMore); setLoading(false);
  }

  const openDetail = useCallback(async (saleId: string) => {
    setDetailLoading(true);
    setDetail({ id: saleId } as SaleDetail); // open the drawer immediately
    const res = await getSaleDetail(saleId);
    setDetailLoading(false);
    if ("error" in res) { setDetail(null); return toast(res.error, "error"); }
    setDetail(res);
  }, [toast]);

  // Refresh the row + open detail after a return is processed.
  const afterReturn = useCallback(async (saleId: string) => {
    const [page, det] = await Promise.all([getSalesPage({ search, limit: Math.max(PAGE, rows.length), offset: 0 }), getSaleDetail(saleId)]);
    setRows(page.rows); setHasMore(page.hasMore);
    if (!("error" in det)) setDetail(det);
    toast("Bill updated — view the updated receipt below.");
  }, [search, rows.length, toast]);

  async function viewBill(saleId: string) {
    setBillBusy(true);
    const data = await getSaleReceiptData(saleId, true); // net of returns = updated bill
    setBillBusy(false);
    if ("error" in data) return toast(data.error, "error");
    setReceipt(data);
  }

  // A fully-returned bill has nothing left to sell — every line is returned.
  const isFullyReturned = (d: SaleDetail) =>
    !!d.items?.length && d.refunded_total > 0 && d.items.every((it) => it.remaining <= 0);

  async function removeBill(saleId: string) {
    setDeleting(true);
    const res = await deleteReturnedSale(saleId);
    setDeleting(false);
    setConfirmDelete(false);
    if ("error" in res) return toast(res.error, "error");
    setDetail(null);
    const page = await getSalesPage({ search, limit: Math.max(PAGE, rows.length), offset: 0 });
    setRows(page.rows); setHasMore(page.hasMore);
    toast("Returned invoice permanently deleted.");
  }

  return (
    <div>
      <PageHeader title="Sales" subtitle="Completed POS bills — open a bill to view, print or process a return" />

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt no. or customer…" className="pl-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs text-text-tertiary">
              <th className="px-4 py-2.5 font-semibold">Receipt</th>
              <th className="px-4 py-2.5 font-semibold">Date</th>
              <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Customer</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Cashier</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
              <th className="px-4 py-2.5 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">{loading ? "Loading…" : "No sales yet."}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2.5 font-medium text-text-primary">
                  {r.receipt_no}
                  {r.has_return && <span className="ml-2 align-middle"><StatusPill tone="amber">Returned</StatusPill></span>}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{fmtDate(r.created_at)}</td>
                <td className="hidden px-4 py-2.5 text-text-secondary sm:table-cell">{r.customer_name || "Walk-in"}</td>
                <td className="hidden px-4 py-2.5 text-text-secondary md:table-cell">{r.cashier_name || "—"}</td>
                <td className="px-4 py-2.5 text-right tnum font-semibold text-text-primary">
                  {formatPKR(r.net_total)}
                  {r.has_return && <div className="text-[11px] font-normal text-text-tertiary line-through">{formatPKR(r.total)}</div>}
                </td>
                <td className="px-4 py-2.5 text-right text-text-tertiary"><ChevronRight className="ml-auto h-4 w-4" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={loadMore} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more</Button>
        </div>
      )}

      {/* Bill detail */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.receipt_no ? `Bill ${detail.receipt_no}` : "Bill"} width="max-w-xl">
        {detailLoading || !detail?.items ? (
          <div className="flex items-center justify-center py-16 text-text-tertiary"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Meta icon={<CalendarClock className="h-3.5 w-3.5" />} label="Date" value={fmtDate(detail.created_at)} />
              <Meta icon={<User className="h-3.5 w-3.5" />} label="Customer" value={detail.customer_name || "Walk-in"} />
              <Meta icon={<User className="h-3.5 w-3.5" />} label="Cashier" value={detail.cashier_name || "—"} />
              <Meta icon={<ReceiptIcon className="h-3.5 w-3.5" />} label="Payment" value={detail.payments.map((p) => p.method).join(", ") || "—"} />
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-surface-2 text-left text-xs text-text-tertiary">
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr></thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.sale_item_id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-text-primary">{it.name}</div>
                        {it.label && <div className="text-xs text-text-tertiary">{it.label}</div>}
                        {it.returned > 0 && <div className="text-[11px] text-amber-text">Returned {it.returned} of {it.qty}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tnum">{it.qty}</td>
                      <td className="px-3 py-2 text-right tnum">{formatPKR(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right tnum">{formatPKR(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 rounded-xl border border-border bg-surface-2 p-3 text-sm">
              <Row label="Subtotal" value={formatPKR(detail.subtotal)} />
              {detail.discount > 0 && <Row label="Discount" value={`- ${formatPKR(detail.discount)}`} />}
              {detail.tax > 0 && <Row label="Tax" value={formatPKR(detail.tax)} />}
              <Row label="Total" value={formatPKR(detail.total)} bold />
              {detail.refunded_total > 0 && <>
                <Row label="Refunded" value={`- ${formatPKR(detail.refunded_total)}`} tone="amber" />
                <Row label="Net total" value={formatPKR(detail.net_total)} bold />
              </>}
            </div>

            {detail.returns.length > 0 && (
              <div className="rounded-xl border border-amber-icon/30 bg-amber-tile/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-text">Returns</p>
                <div className="space-y-2">
                  {detail.returns.map((r) => (
                    <div key={r.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">{fmtDate(r.created_at)} · {r.refund_method}</span>
                        <span className="tnum font-medium text-amber-text">- {formatPKR(r.total)}</span>
                      </div>
                      <div className="text-xs text-text-tertiary">{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}{r.reason ? ` · ${r.reason}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => viewBill(detail.id)} disabled={billBusy}>
                {billBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} {detail.refunded_total > 0 ? "View updated bill" : "View / print bill"}
              </Button>
              {detail.items.some((it) => it.remaining > 0) && (
                <Button variant="secondary" onClick={() => setReturnFor(detail.receipt_no)}>
                  <RotateCcw className="h-4 w-4" /> Return items
                </Button>
              )}
              {/* Owner-only permanent delete — only for bills returned in full. */}
              {isOwner && isFullyReturned(detail) && (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete invoice
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Owner-only: permanently delete a fully-returned invoice. */}
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => detail && removeBill(detail.id)}
        tone="danger"
        loading={deleting}
        icon={<Trash2 className="h-5 w-5" />}
        title="Delete returned invoice?"
        message="This permanently deletes this returned invoice. Continue?"
        confirmLabel="Delete permanently"
      />

      {/* Return flow (reuses the POS return engine + UI) */}
      <ReturnsSheet
        open={!!returnFor}
        initialReceipt={returnFor ?? undefined}
        onClose={() => setReturnFor(null)}
        onProcessed={(saleId) => { setReturnFor(null); void afterReturn(saleId); }}
      />

      {/* Updated bill — shared invoice template (preview + print + WhatsApp) */}
      <Receipt data={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">{icon} {label}</div>
      <div className="mt-0.5 font-medium text-text-primary">{value}</div>
    </div>
  );
}
function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "amber" }) {
  return (
    <div className="flex items-center justify-between">
      <span className={tone === "amber" ? "text-amber-text" : "text-text-secondary"}>{label}</span>
      <span className={`tnum ${bold ? "font-bold text-text-primary" : tone === "amber" ? "text-amber-text" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
