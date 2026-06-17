"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Trash2, ArrowLeft, PackageCheck, ClipboardList, Camera,
  CheckCircle2, AlertTriangle, ScanLine, Link2, X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { VariantSearch, type VariantSearchItem } from "@/components/ui/VariantSearch";
import { CameraScanner } from "@/components/scan/CameraScannerLazy";
import { useCatalog } from "@/lib/useCatalog";
import { ensureCatalog, lookupByBarcode, type CatalogItem } from "@/lib/catalog-cache";
import { useScanHandler } from "@/components/scan/ScanProvider";
import { parseScan } from "@/lib/barcode";
import { beepOk, beepError } from "@/lib/sound";
import { cn, formatPKR } from "@/lib/utils";
import { receiveStock, linkBarcode } from "./actions";

function toVS(it: CatalogItem): VariantSearchItem {
  return {
    variant_id: it.variant_id, product_id: it.product_id, product_name: it.product_name,
    label: it.label, sku: it.sku, barcode: it.barcode, cost: it.cost, sale_price: it.price,
  };
}

export interface OpenPO {
  id: string;
  po_no: string;
  supplier_id: string | null;
  status: string;
  expected_at: string | null;
  items: { id: string; variant_id: string; product_id: string; qty: number; received_qty: number; unit_cost: number }[];
}

interface Line {
  variant_id: string;
  product_id: string;
  po_item_id: string | null;
  name: string;
  label: string;
  sku: string;
  qty: string;
  unit_cost: string;
  lot: string;
  expiry: string;
}

export function ReceiveClient({
  variants, suppliers, openPOs, locations,
}: {
  variants: VariantSearchItem[];
  suppliers: { id: string; name: string }[];
  openPOs: OpenPO[];
  locations: { code: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [locCode, setLocCode] = useState(locations[0]?.code ?? "MAIN");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScan, setLastScan] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingUnknown, setPendingUnknown] = useState<string | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useCatalog(); // keep the local catalogue index warm for instant scan resolution

  const variantMap = useMemo(() => new Map(variants.map((v) => [v.variant_id, v])), [variants]);
  const chosen = useMemo(() => new Set(lines.map((l) => l.variant_id)), [lines]);

  function flash(ok: boolean, text: string) {
    setLastScan({ ok, text });
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setLastScan(null), 2200);
  }

  function addLine(v: VariantSearchItem, poItemId: string | null = null, qty = "", cost = "") {
    setLines((ls) => ls.some((l) => l.variant_id === v.variant_id)
      ? ls
      : [...ls, {
          variant_id: v.variant_id, product_id: v.product_id, po_item_id: poItemId,
          name: v.product_name, label: v.label, sku: v.sku,
          qty, unit_cost: cost || String(v.cost || ""), lot: "", expiry: "",
        }]);
  }

  // Continuous scan-to-receive: a known barcode adds a line or bumps its qty;
  // a weight-embedded code adds the decoded kg. Unknown codes prompt a link.
  function bump(v: VariantSearchItem, qty: number, weight: boolean) {
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.variant_id === v.variant_id);
      if (idx >= 0) {
        const next = [...ls];
        next[idx] = { ...next[idx], qty: String((Number(next[idx].qty) || 0) + qty) };
        return next;
      }
      return [...ls, {
        variant_id: v.variant_id, product_id: v.product_id, po_item_id: null,
        name: v.product_name, label: v.label, sku: v.sku,
        qty: String(qty), unit_cost: String(v.cost || ""), lot: "", expiry: "",
      }];
    });
    beepOk();
    flash(true, weight ? `${v.product_name} +${qty.toFixed(3)} kg` : `${v.product_name} +${qty}`);
  }

  function handleScan(raw: string) {
    const parsed = parseScan(raw);
    const item = lookupByBarcode(parsed.lookupKey) || lookupByBarcode(parsed.barcode);
    const v = item
      ? variantMap.get(item.variant_id) ?? toVS(item)
      : variants.find((x) => x.barcode === parsed.lookupKey || x.barcode === parsed.barcode);
    if (!v) {
      beepError();
      flash(false, `Unknown barcode: ${parsed.barcode}`);
      setPendingUnknown(parsed.barcode);
      return;
    }
    const qty = parsed.isWeightEmbedded && parsed.weight ? parsed.weight : 1;
    bump(v, qty, parsed.isWeightEmbedded);
  }

  async function linkAndAdd(v: VariantSearchItem) {
    if (!pendingUnknown) return;
    const res = await linkBarcode(v.variant_id, v.product_id, pendingUnknown);
    if (res?.error) return toast(res.error, "error");
    toast(`Barcode linked to ${v.product_name}`);
    void ensureCatalog({ force: true });
    setPendingUnknown(null);
    bump(v, 1, false);
  }

  useScanHandler((code) => handleScan(code));

  function loadPO(id: string) {
    setPoId(id);
    const po = openPOs.find((p) => p.id === id);
    if (!po) return;
    if (po.supplier_id) setSupplierId(po.supplier_id);
    // pre-fill remaining quantities
    const newLines: Line[] = [];
    for (const it of po.items) {
      const remaining = it.qty - it.received_qty;
      if (remaining <= 0) continue;
      const v = variantMap.get(it.variant_id);
      if (!v) continue;
      newLines.push({
        variant_id: v.variant_id, product_id: v.product_id, po_item_id: it.id,
        name: v.product_name, label: v.label, sku: v.sku,
        qty: String(remaining), unit_cost: String(it.unit_cost), lot: "", expiry: "",
      });
    }
    setLines(newLines);
  }

  const setField = (i: number, k: keyof Line, val: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: val } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  async function confirm() {
    if (!lines.length) return toast("Add at least one line", "error");
    if (lines.some((l) => !l.qty || Number(l.qty) <= 0)) return toast("Every line needs a quantity", "error");
    setSaving(true);
    const res = await receiveStock({
      supplier_id: supplierId || null,
      po_id: poId || null,
      location_code: locCode,
      note: note || null,
      lines: lines.map((l) => ({
        variant_id: l.variant_id, product_id: l.product_id, po_item_id: l.po_item_id,
        qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0,
        lot_number: l.lot || null, expiry: l.expiry || null,
      })),
    });
    setSaving(false);
    if (res?.error) return toast(res.error, "error");
    toast(`Received — ${res.grn_no}`);
    router.push("/purchasing");
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Receive Stock"
        subtitle="Add many variants in one receipt — scan or search each line"
        actions={
          <Link href="/purchasing"><Button variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <ClipboardList className="h-4 w-4" /> Add items
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCameraOpen(true)}>
                <Camera className="h-4 w-4" /> Scan
              </Button>
            </div>
            <VariantSearch items={variants} onPick={(v) => addLine(v)} exclude={chosen} autoFocus />

            {lastScan && (
              <div className={cn(
                "mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm animate-fade-in",
                lastScan.ok ? "border-green-icon/30 bg-green-tile text-green-text" : "border-coral-icon/30 bg-coral-tile text-coral-text",
              )}>
                {lastScan.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span className="truncate">{lastScan.text}</span>
                <ScanLine className="ml-auto h-4 w-4 opacity-60" />
              </div>
            )}

            {pendingUnknown && (
              <div className="mt-3 rounded-xl border border-amber-icon/40 bg-amber-tile p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-text">
                  <Link2 className="h-4 w-4" /> Link barcode <span className="font-mono">{pendingUnknown}</span>
                  <button onClick={() => setPendingUnknown(null)} className="ml-auto rounded p-1 hover:bg-amber-icon/10"><X className="h-4 w-4" /></button>
                </div>
                <p className="mb-2 text-xs text-amber-text/80">
                  Pick the product this barcode belongs to — it’ll be saved and added to the receipt.
                </p>
                <VariantSearch items={variants} onPick={(v) => linkAndAdd(v)} placeholder="Search product to link…" />
              </div>
            )}

            {lines.length === 0 ? (
              <div className="mt-4"><EmptyState icon={PackageCheck} title="No lines yet" description="Scan a barcode or search above to add items to this receipt." /></div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-tertiary">
                      <th className="px-2 py-2 text-left font-semibold">Item</th>
                      <th className="px-2 py-2 text-right font-semibold">Qty</th>
                      <th className="px-2 py-2 text-right font-semibold">Unit cost</th>
                      <th className="px-2 py-2 text-left font-semibold">Lot / Expiry</th>
                      <th className="px-2 py-2 text-right font-semibold">Line total</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.variant_id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-2">
                          <div className="font-medium text-text-primary">{l.name}</div>
                          <div className="text-xs text-text-tertiary">{l.label} · {l.sku}{l.po_item_id ? " · PO" : ""}</div>
                        </td>
                        <td className="px-2 py-2"><Input type="number" value={l.qty} onChange={(e) => setField(i, "qty", e.target.value)} className="h-8 w-20 text-right text-sm" /></td>
                        <td className="px-2 py-2"><Input type="number" value={l.unit_cost} onChange={(e) => setField(i, "unit_cost", e.target.value)} className="h-8 w-24 text-right text-sm" /></td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Input value={l.lot} onChange={(e) => setField(i, "lot", e.target.value)} placeholder="Lot" className="h-8 w-20 text-sm" />
                            <Input type="date" value={l.expiry} onChange={(e) => setField(i, "expiry", e.target.value)} className="h-8 w-32 text-sm" />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tnum">{formatPKR((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => removeLine(i)} className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* side panel */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div>
              <Label>Against PO (optional)</Label>
              <Select value={poId} onChange={(e) => e.target.value ? loadPO(e.target.value) : (setPoId(""), setLines([]))}>
                <option value="">Free receipt (no PO)</option>
                {openPOs.map((p) => <option key={p.id} value={p.id}>{p.po_no} · {p.status}</option>)}
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— None —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            {locations.length > 1 && (
              <div>
                <Label>Into location</Label>
                <Select value={locCode} onChange={(e) => setLocCode(e.target.value)}>
                  {locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </Select>
              </div>
            )}
            <div>
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice #, remarks…" />
            </div>
          </Card>
        </div>
      </div>

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onResult={(code) => handleScan(code)}
        continuous
        title="Scan items to receive"
      />

      {/* sticky totals bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:left-[var(--sidebar-w,16rem)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex gap-6 text-sm">
            <div><span className="text-text-tertiary">Lines</span> <span className="tnum font-semibold text-text-primary">{lines.length}</span></div>
            <div><span className="text-text-tertiary">Units</span> <span className="tnum font-semibold text-text-primary">{totalQty}</span></div>
            <div><span className="text-text-tertiary">Total</span> <span className="tnum font-heading text-lg font-bold text-text-primary">{formatPKR(total)}</span></div>
          </div>
          <Button onClick={confirm} disabled={saving || !lines.length}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Confirm Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
