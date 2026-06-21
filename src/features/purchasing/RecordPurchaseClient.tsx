"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, Trash2, ArrowLeft, ShoppingCart, Camera, CheckCircle2, AlertTriangle,
  ScanLine, Plus, PackagePlus, Wallet, CreditCard, Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { VariantSearch, type VariantSearchItem } from "@/components/ui/VariantSearch";
import { CameraScanner } from "@/components/scan/CameraScannerLazy";
import { useCatalog } from "@/lib/useCatalog";
import { ensureCatalog, lookupBarcodeLoose, type CatalogItem } from "@/lib/catalog-cache";
import { useScanHandler } from "@/components/scan/ScanProvider";
import { parseScan } from "@/lib/barcode";
import { beepOk, beepError } from "@/lib/sound";
import { cn, formatPKR } from "@/lib/utils";
import { recordPurchase, quickCreatePurchaseItem } from "./actions";
import { SupplierDrawer } from "./PurchasingClient";

function toVS(it: CatalogItem): VariantSearchItem {
  return {
    variant_id: it.variant_id, product_id: it.product_id, product_name: it.product_name,
    label: it.label, sku: it.sku, barcode: it.barcode, cost: it.cost, sale_price: it.price,
  };
}

interface Line {
  variant_id: string;
  product_id: string;
  name: string;
  label: string;
  sku: string;
  qty: string;
  unit_cost: string;
  lot: string;
  expiry: string;
}

type Payment = "paid" | "credit";

export function RecordPurchaseClient({
  variants, suppliers, locations,
}: {
  variants: VariantSearchItem[];
  suppliers: { id: string; name: string }[];
  locations: { code: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState(""); // "" = cash purchase (no supplier)
  const [supplierList, setSupplierList] = useState(suppliers);
  const [addSupplier, setAddSupplier] = useState(false);
  const [locCode, setLocCode] = useState(locations[0]?.code ?? "MAIN");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<Payment>("paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newItem, setNewItem] = useState(false);
  const [newItemBarcode, setNewItemBarcode] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{ ok: boolean; text: string } | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useCatalog(); // keep the local catalogue index warm for instant scan resolution

  const variantMap = useMemo(() => new Map(variants.map((v) => [v.variant_id, v])), [variants]);
  const chosen = useMemo(() => new Set(lines.map((l) => l.variant_id)), [lines]);

  function flash(ok: boolean, text: string) {
    setLastScan({ ok, text });
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setLastScan(null), 2200);
  }

  function addLine(v: VariantSearchItem, qty = "1") {
    setLines((ls) => ls.some((l) => l.variant_id === v.variant_id)
      ? ls
      : [...ls, {
          variant_id: v.variant_id, product_id: v.product_id,
          name: v.product_name, label: v.label, sku: v.sku,
          qty, unit_cost: String(v.cost || ""), lot: "", expiry: "",
        }]);
  }

  // Scanning: a known barcode adds a line or bumps its qty; weight-embedded codes
  // add the decoded kg. Unknown codes hint at the "New item" button.
  function bump(v: VariantSearchItem, qty: number, weight: boolean) {
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.variant_id === v.variant_id);
      if (idx >= 0) {
        const next = [...ls];
        next[idx] = { ...next[idx], qty: String((Number(next[idx].qty) || 0) + qty) };
        return next;
      }
      return [...ls, {
        variant_id: v.variant_id, product_id: v.product_id,
        name: v.product_name, label: v.label, sku: v.sku,
        qty: String(qty), unit_cost: String(v.cost || ""), lot: "", expiry: "",
      }];
    });
    beepOk();
    flash(true, weight ? `${v.product_name} +${qty.toFixed(3)} kg` : `${v.product_name} +${qty}`);
  }

  function handleScan(raw: string) {
    const parsed = parseScan(raw);
    const item = lookupBarcodeLoose(parsed.lookupKey) ?? lookupBarcodeLoose(parsed.barcode);
    const v = item
      ? variantMap.get(item.variant_id) ?? toVS(item)
      : variants.find((x) => x.barcode === parsed.lookupKey || x.barcode === parsed.barcode);
    if (!v) {
      beepError();
      flash(false, `Not in system: ${parsed.barcode} — create it to add`);
      // Open inline create pre-filled with the scanned code so it becomes a line.
      setNewItemBarcode(parsed.barcode);
      setNewItem(true);
      return;
    }
    const qty = parsed.isWeightEmbedded && parsed.weight ? parsed.weight : 1;
    bump(v, qty, parsed.isWeightEmbedded);
  }

  useScanHandler((code) => handleScan(code));

  const setField = (i: number, k: keyof Line, val: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: val } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const paidNow = payment === "paid" ? total : Math.max(0, Math.min(Number(amountPaid) || 0, total));
  const credit = total - paidNow;

  async function confirm() {
    if (!lines.length) return toast("Add at least one item", "error");
    if (lines.some((l) => !l.qty || Number(l.qty) <= 0)) return toast("Every item needs a quantity", "error");
    if (payment === "credit" && !supplierId) return toast("Choose a supplier for a credit purchase", "error");
    setSaving(true);
    const res = await recordPurchase({
      supplier_id: supplierId || null,
      location_code: locCode,
      note: note || null,
      payment,
      amount_paid: payment === "credit" ? Number(amountPaid) || 0 : undefined,
      lines: lines.map((l) => ({
        variant_id: l.variant_id, product_id: l.product_id,
        qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0,
        lot_number: l.lot || null, expiry: l.expiry || null,
      })),
    });
    setSaving(false);
    if (res?.error) return toast(res.error, "error");
    toast(`Purchase saved — ${res.grn_no}`);
    router.push("/admin/purchasing");
  }

  return (
    <div className="pb-28">
      <PageHeader
        title="Record Purchase"
        subtitle="Add the stock you bought — scan or search each item, then choose how it was paid"
        actions={
          <Link href="/admin/purchasing"><Button variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <PackagePlus className="h-4 w-4" /> Items bought
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => { setNewItemBarcode(null); setNewItem(true); }}>
                  <Plus className="h-4 w-4" /> New item
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setCameraOpen(true)}>
                  <Camera className="h-4 w-4" /> Scan
                </Button>
              </div>
            </div>
            <VariantSearch items={variants} onPick={(v) => addLine(v)} exclude={chosen} autoFocus placeholder="Scan barcode or search an item to add…" />
            <p className="mt-2 text-xs text-text-tertiary">
              Item not in the system yet? Tap <span className="font-medium">New item</span> to create it right here.
            </p>

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

            {lines.length === 0 ? (
              <div className="mt-4"><EmptyState icon={ShoppingCart} title="No items yet" description="Scan, search or create the items you bought to build this purchase." /></div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-tertiary">
                      <th className="px-2 py-2 text-left font-semibold">Item</th>
                      <th className="px-2 py-2 text-right font-semibold">Qty</th>
                      <th className="px-2 py-2 text-right font-semibold">Cost price</th>
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
                          <div className="text-xs text-text-tertiary">{l.label} · {l.sku}</div>
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
                <p className="mt-2 px-2 text-xs text-text-tertiary">Lot / Expiry is optional — fill it for perishable goods so near-expiry alerts work.</p>
              </div>
            )}
          </Card>
        </div>

        {/* side panel */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Cash purchase (no supplier)</option>
                {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <button type="button" onClick={() => setAddSupplier(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <Plus className="h-3 w-3" /> Add a new supplier
              </button>
            </div>
            {locations.length > 1 && (
              <div>
                <Label>Add stock into</Label>
                <Select value={locCode} onChange={(e) => setLocCode(e.target.value)}>
                  {locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </Select>
              </div>
            )}
            <div>
              <Label>Note / invoice #</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bill #4471" />
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <Label>Payment</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayment("paid")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  payment === "paid" ? "border-brand-500 bg-brand-50 text-brand-600" : "border-border text-text-secondary hover:bg-surface-2",
                )}
              >
                <Wallet className="h-4 w-4" /> Paid (cash)
              </button>
              <button
                type="button"
                onClick={() => setPayment("credit")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  payment === "credit" ? "border-brand-500 bg-brand-50 text-brand-600" : "border-border text-text-secondary hover:bg-surface-2",
                )}
              >
                <CreditCard className="h-4 w-4" /> On credit
              </button>
            </div>

            {payment === "credit" && (
              <>
                <div>
                  <Label>Paid now (optional)</Label>
                  <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" />
                  <p className="mt-1 text-xs text-text-tertiary">Leave 0 for a full credit purchase, or enter a part-payment.</p>
                </div>
                {!supplierId && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-tile px-2.5 py-1.5 text-xs text-amber-text">
                    <Info className="h-3.5 w-3.5 shrink-0" /> Pick a supplier above to buy on credit.
                  </p>
                )}
              </>
            )}

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><span className="text-text-secondary">Total</span><span className="tnum font-semibold text-text-primary">{formatPKR(total)}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Paying now</span><span className="tnum text-text-primary">{formatPKR(paidNow)}</span></div>
              {credit > 0 && (
                <div className="flex justify-between"><span className="text-coral-text">Added to payable</span><span className="tnum font-medium text-coral-text">{formatPKR(credit)}</span></div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onResult={(code) => handleScan(code)}
        continuous
        title="Scan items bought"
      />

      <NewItemDrawer
        open={newItem}
        initialBarcode={newItemBarcode}
        onClose={() => { setNewItem(false); setNewItemBarcode(null); }}
        onCreated={(v) => { setNewItem(false); setNewItemBarcode(null); addLine(v); void ensureCatalog({ force: true }); toast(`${v.product_name} created & added`); }}
        onError={(m) => toast(m, "error")}
      />

      <SupplierDrawer
        open={addSupplier}
        onClose={() => setAddSupplier(false)}
        onSaved={(id) => {
          setAddSupplier(false);
          toast("Supplier added");
          if (id) {
            // Optimistically add + select so the new supplier is usable immediately.
            setSupplierList((ls) => ls.some((s) => s.id === id) ? ls : [...ls, { id, name: "New supplier" }].sort((a, b) => a.name.localeCompare(b.name)));
            setSupplierId(id);
          }
          router.refresh();
        }}
        onError={(m) => toast(m, "error")}
      />

      {/* sticky totals bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:left-[var(--sidebar-w,16rem)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex gap-6 text-sm">
            <div><span className="text-text-tertiary">Items</span> <span className="tnum font-semibold text-text-primary">{lines.length}</span></div>
            <div><span className="text-text-tertiary">Units</span> <span className="tnum font-semibold text-text-primary">{totalQty}</span></div>
            <div><span className="text-text-tertiary">Total</span> <span className="tnum font-heading text-lg font-bold text-text-primary">{formatPKR(total)}</span></div>
          </div>
          <Button onClick={confirm} disabled={saving || !lines.length}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />} Save Purchase
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Quick-create item drawer ---------------- */

function NewItemDrawer({
  open, initialBarcode, onClose, onCreated, onError,
}: {
  open: boolean;
  /** Pre-fill the barcode when opened from an unknown scan. */
  initialBarcode?: string | null;
  onClose: () => void;
  onCreated: (v: VariantSearchItem) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  // Sync the scanned barcode in whenever the drawer is (re)opened.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setBarcode(initialBarcode ?? "");
  }

  function reset() {
    setName(""); setUnit("pcs"); setCost(""); setPrice(""); setBarcode(""); setErr(undefined);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!name.trim()) { setErr("Item name is required."); return; }
    setSaving(true);
    const res = await quickCreatePurchaseItem({
      name, base_unit: unit, cost: Number(cost) || 0, sale_price: Number(price) || 0,
      barcode: barcode.trim() || null,
    });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    if (res.ok) { reset(); onCreated(res.item); }
  }

  return (
    <Drawer open={open} onClose={onClose} title="New item" width="max-w-md" footer={
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="new-item-form" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create &amp; add</Button>
      </div>
    }>
      <form id="new-item-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          Creates a simple product so you can buy it now. You can add variants, photos and categories later in Products.
        </p>
        <div><Label>Item name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tapal Danedar 250g" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unit</Label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="pcs">Piece (pcs)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="g">Gram (g)</option>
              <option value="ltr">Litre (ltr)</option>
              <option value="ml">Millilitre (ml)</option>
              <option value="pkt">Packet (pkt)</option>
              <option value="box">Box</option>
              <option value="dozen">Dozen</option>
            </Select>
          </div>
          <div><Label>Barcode (optional)</Label><Input data-scan-input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Cost price (₨)</Label><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="What you pay" /></div>
          <div><Label>Sale price (₨)</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="What you sell at" /></div>
        </div>
        <p className="text-xs text-text-tertiary">Cost price pre-fills the purchase line — you can still adjust it there.</p>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
