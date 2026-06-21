"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Truck, Wallet, FileText, PackageCheck, Loader2, Trash2, Building2,
  Phone, Mail, ChevronRight, ChevronDown, Settings2, ShoppingCart, Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { VariantSearch, type VariantSearchItem } from "@/components/ui/VariantSearch";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { formatPKR } from "@/lib/utils";
import { createSupplier, createPurchaseOrder, type SupplierInput } from "./actions";

export interface SupplierRow {
  id: string; name: string; contact_person: string | null; phone: string | null;
  email: string | null; city: string | null; payment_terms: string | null;
  balance: number; active: boolean;
}
export interface PORow {
  id: string; po_no: string; supplier: string; status: string;
  expected_at: string | null; total: number; created_at: string;
}
export interface ReceiptRow { id: string; grn_no: string; supplier: string; total: number; created_at: string; }

type Tab = "suppliers" | "pos" | "receipts";

export function PurchasingClient({
  variants, suppliers, pos, receipts, kpis,
}: {
  variants: VariantSearchItem[];
  suppliers: SupplierRow[];
  pos: PORow[];
  receipts: ReceiptRow[];
  kpis: { payables: number; suppliers: number; openPOs: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("suppliers");
  const [addSupplier, setAddSupplier] = useState(false);
  const [newPO, setNewPO] = useState(false);

  const supplierCols: Column<SupplierRow>[] = [
    {
      key: "name", header: "Supplier",
      cell: (s) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-text-tertiary"><Building2 className="h-4 w-4" /></div>
          <div>
            <div className="font-medium text-text-primary">{s.name}</div>
            <div className="text-xs text-text-tertiary">{s.contact_person ?? s.city ?? "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Contact", cell: (s) => (
      <div className="text-xs text-text-secondary">
        {s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}
        {s.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>}
        {!s.phone && !s.email && "—"}
      </div>
    ) },
    { key: "payment_terms", header: "Terms", cell: (s) => s.payment_terms ?? "—" },
    { key: "balance", header: "Payable", align: "right", cell: (s) => (
      <span className={s.balance > 0 ? "tnum font-medium text-coral-text" : "tnum text-text-tertiary"}>{formatPKR(s.balance)}</span>
    ) },
    { key: "go", header: "", align: "right", cell: () => <ChevronRight className="ml-auto h-4 w-4 text-text-tertiary" /> },
  ];

  const poCols: Column<PORow>[] = [
    { key: "po_no", header: "PO #", cell: (p) => <span className="font-medium text-text-primary">{p.po_no}</span> },
    { key: "supplier", header: "Supplier" },
    { key: "expected_at", header: "Expected", cell: (p) => p.expected_at ? new Date(p.expected_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short" }) : "—" },
    { key: "total", header: "Total", align: "right", cell: (p) => <span className="tnum">{formatPKR(p.total)}</span> },
    { key: "status", header: "Status", cell: (p) => <StatusPill status={p.status.toLowerCase()} /> },
  ];

  const receiptCols: Column<ReceiptRow>[] = [
    { key: "grn_no", header: "GRN #", cell: (r) => <span className="font-medium text-text-primary">{r.grn_no}</span> },
    { key: "supplier", header: "Supplier" },
    { key: "created_at", header: "Date", cell: (r) => new Date(r.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) },
    { key: "total", header: "Value", align: "right", cell: (r) => <span className="tnum">{formatPKR(r.total)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Purchasing"
        subtitle="Buy stock, pay suppliers and keep your shelves full"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportMenu
              filename="suppliers"
              title="Suppliers & payables"
              columns={[
                { key: "name", header: "Supplier" }, { key: "contact", header: "Contact" },
                { key: "phone", header: "Phone" }, { key: "terms", header: "Terms" },
                { key: "payable", header: "Payable" },
              ]}
              rows={suppliers.map((s) => ({ name: s.name, contact: s.contact_person ?? "", phone: s.phone ?? "", terms: s.payment_terms ?? "", payable: s.balance }))}
            />
            <Link href="/admin/purchasing/record"><Button size="sm"><ShoppingCart className="h-4 w-4" /> Record Purchase</Button></Link>
          </div>
        }
      />

      {/* Primary everyday action — record a purchase you've already bought */}
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><ShoppingCart className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading text-base font-bold text-text-primary">Record a purchase</h2>
            <p className="text-sm text-text-secondary">
              Bought stock from a supplier or the market? Add the items, choose paid or on credit, and save.
              Stock, cost and payables update automatically — no purchase order needed.
            </p>
          </div>
        </div>
        <Link href="/admin/purchasing/record" className="shrink-0"><Button><ShoppingCart className="h-4 w-4" /> Record Purchase</Button></Link>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total Payables" value={formatPKR(kpis.payables, { compact: true })} fullValue={formatPKR(kpis.payables)} icon={Wallet} accent="coral" hint="What you owe suppliers" />
        <StatTile label="Suppliers" value={kpis.suppliers} icon={Truck} accent="blue" />
        <StatTile label="Open POs" value={kpis.openPOs} icon={FileText} accent="amber" hint="Pre-orders awaiting goods" />
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
        {([["suppliers", "Suppliers"], ["receipts", "Purchase History"], ["pos", "Purchase Orders"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-brand-500 text-white" : "text-text-secondary hover:bg-surface-2"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "suppliers" && (
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-text-secondary">{suppliers.length} suppliers · tap one to see its payable &amp; history</span>
            <Button size="sm" variant="secondary" onClick={() => setAddSupplier(true)}><Plus className="h-4 w-4" /> Add Supplier</Button>
          </div>
          <DataTable
            columns={supplierCols}
            rows={suppliers}
            onRowClick={(s) => router.push(`/admin/purchasing/suppliers/${s.id}`)}
            empty={<EmptyState icon={Truck} title="No suppliers yet" description="Add your first supplier to start purchasing." />}
          />
        </Card>
      )}

      {tab === "receipts" && (
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-text-secondary">
            <Info className="h-4 w-4 shrink-0 text-text-tertiary" />
            Every purchase you record or receive shows here as a bill, with the stock it added.
          </div>
          <DataTable columns={receiptCols} rows={receipts} empty={<EmptyState icon={PackageCheck} title="No purchases yet" description="Record a purchase and it will appear here." />} />
        </Card>
      )}

      {tab === "pos" && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-text-secondary">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <span>
                <span className="font-medium text-text-primary">Optional.</span> A purchase order pre-orders stock from a
                supplier <span className="font-medium">before</span> it arrives. When the goods come, open
                {" "}<Link href="/admin/purchasing/receive" className="text-brand-600 hover:underline">Receive Stock</Link> and
                pick the PO to add it in. For an everyday buy, use <span className="font-medium">Record Purchase</span> instead.
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Link href="/admin/purchasing/receive"><Button size="sm" variant="secondary"><PackageCheck className="h-4 w-4" /> Receive Stock</Button></Link>
              <Button size="sm" variant="secondary" onClick={() => setNewPO(true)}><FileText className="h-4 w-4" /> New PO</Button>
            </div>
          </div>
          <DataTable columns={poCols} rows={pos} empty={<EmptyState icon={FileText} title="No purchase orders" description="POs are optional — create one only to pre-order stock before it arrives." />} />
        </Card>
      )}

      <SupplierDrawer
        open={addSupplier}
        onClose={() => setAddSupplier(false)}
        onSaved={() => { setAddSupplier(false); toast("Supplier added"); router.refresh(); }}
        onError={(m) => toast(m, "error")}
      />

      <NewPODrawer
        open={newPO}
        variants={variants}
        suppliers={suppliers}
        onClose={() => setNewPO(false)}
        onSaved={(po) => { setNewPO(false); toast(`Created ${po}`); router.refresh(); }}
        onError={(m) => toast(m, "error")}
      />
    </div>
  );
}

/* ---------------- Add supplier drawer (also reused on detail page) ---------------- */

export function SupplierDrawer({
  open, onClose, onSaved, onError,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
  onError: (m: string) => void;
}) {
  const empty: SupplierInput = {
    name: "", contact_person: "", phone: "", email: "", address: "", city: "",
    ntn: "", payment_terms: "", bank_details: "", opening_balance: 0, notes: "",
  };
  const [form, setForm] = useState<SupplierInput>(empty);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof SupplierInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!form.name?.trim()) { setErr("Supplier name is required."); return; }
    setSaving(true);
    const res = await createSupplier({ ...form, opening_balance: Number(form.opening_balance) || 0 });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm(empty);
    setAdvanced(false);
    onSaved(res.id);
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add Supplier" width="max-w-lg" footer={
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="supplier-form" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Supplier</Button>
      </div>
    }>
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          A supplier is anyone you buy stock from (a wholesaler, a distributor, the bakery van).
          Only the name is required — add the rest if you have it.
        </p>
        <div><Label>Supplier name *</Label><Input value={form.name} onChange={set("name")} placeholder="e.g. Karachi Wholesale Mart" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={set("phone")} placeholder="03xx-xxxxxxx" /></div>
          <div><Label>City</Label><Input value={form.city ?? ""} onChange={set("city")} placeholder="e.g. Lahore" /></div>
        </div>
        <div><Label>Address</Label><Input value={form.address ?? ""} onChange={set("address")} placeholder="Shop / market address" /></div>
        <div>
          <Label>Opening balance (₨)</Label>
          <Input type="number" value={String(form.opening_balance ?? "")} onChange={set("opening_balance")} placeholder="0" />
          <p className="mt-1 text-xs text-text-tertiary">Money you already owed this supplier before using the system. Leave 0 if none.</p>
        </div>
        <div><Label>Notes</Label><Input value={form.notes ?? ""} onChange={set("notes")} placeholder="Anything useful — delivery days, contact name…" /></div>

        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-2"
          >
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Advanced (optional)</span>
            {advanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {advanced && (
            <div className="space-y-3 border-t border-border p-3">
              <p className="text-xs text-text-tertiary">Most general stores can skip these — they’re only for formal/tax accounting.</p>
              <div><Label>Contact person</Label><Input value={form.contact_person ?? ""} onChange={set("contact_person")} placeholder="Who you usually deal with" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={set("email")} /></div>
              <div>
                <Label>NTN / Tax #</Label>
                <Input value={form.ntn ?? ""} onChange={set("ntn")} />
                <p className="mt-1 text-xs text-text-tertiary">Tax registration number — only if you file sales tax.</p>
              </div>
              <div>
                <Label>Payment terms</Label>
                <Input value={form.payment_terms ?? ""} onChange={set("payment_terms")} placeholder="e.g. Cash, 30 days" />
                <p className="mt-1 text-xs text-text-tertiary">How long this supplier gives you to pay.</p>
              </div>
              <div>
                <Label>Bank details</Label>
                <Input value={form.bank_details ?? ""} onChange={set("bank_details")} />
                <p className="mt-1 text-xs text-text-tertiary">Account/IBAN for online transfers, if you pay that way.</p>
              </div>
            </div>
          )}
        </div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

/* ---------------- New PO drawer (multi-line) ---------------- */

interface POLine { variant_id: string; product_id: string; name: string; label: string; sku: string; qty: string; unit_cost: string; }

function NewPODrawer({
  open, variants, suppliers, onClose, onSaved, onError,
}: {
  open: boolean;
  variants: VariantSearchItem[];
  suppliers: SupplierRow[];
  onClose: () => void;
  onSaved: (po: string) => void;
  onError: (m: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLine[]>([]);
  const [saving, setSaving] = useState(false);
  const chosen = new Set(lines.map((l) => l.variant_id));

  function addLine(v: VariantSearchItem) {
    setLines((ls) => ls.some((l) => l.variant_id === v.variant_id) ? ls : [...ls, {
      variant_id: v.variant_id, product_id: v.product_id, name: v.product_name, label: v.label, sku: v.sku,
      qty: "1", unit_cost: String(v.cost || ""),
    }]);
  }
  const setField = (i: number, k: keyof POLine, val: string) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, [k]: val } : l));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) return onError("Add at least one line.");
    setSaving(true);
    const res = await createPurchaseOrder({
      supplier_id: supplierId || null, expected_at: expected || null, notes: notes || null,
      lines: lines.map((l) => ({ variant_id: l.variant_id, product_id: l.product_id, qty: Number(l.qty) || 0, unit_cost: Number(l.unit_cost) || 0 })),
    });
    setSaving(false);
    if (res?.error) return onError(res.error);
    setSupplierId(""); setExpected(""); setNotes(""); setLines([]);
    onSaved(res.po_no!);
  }

  return (
    <Drawer open={open} onClose={onClose} title="New Purchase Order" width="max-w-2xl" footer={
      <div className="flex items-center justify-between gap-3">
        <span className="tnum text-sm text-text-secondary">Total <span className="font-heading text-lg font-bold text-text-primary">{formatPKR(total)}</span></span>
        <Button type="submit" form="po-form" disabled={saving || !lines.length}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create PO</Button>
      </div>
    }>
      <form id="po-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Supplier</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— None —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div><Label>Expected date</Label><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
        </div>
        <div><Label>Add items</Label><VariantSearch items={variants} onPick={addLine} exclude={chosen} /></div>

        {lines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="px-2 py-2 text-left font-semibold">Item</th>
                  <th className="px-2 py-2 text-right font-semibold">Qty</th>
                  <th className="px-2 py-2 text-right font-semibold">Cost</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.variant_id} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-2"><div className="font-medium text-text-primary">{l.name}</div><div className="text-xs text-text-tertiary">{l.label}</div></td>
                    <td className="px-2 py-2"><Input type="number" value={l.qty} onChange={(e) => setField(i, "qty", e.target.value)} className="h-8 w-16 text-right text-sm" /></td>
                    <td className="px-2 py-2"><Input type="number" value={l.unit_cost} onChange={(e) => setField(i, "unit_cost", e.target.value)} className="h-8 w-20 text-right text-sm" /></td>
                    <td className="px-2 py-2 text-right tnum">{formatPKR((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</td>
                    <td className="px-2 py-2 text-right"><button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="rounded-md p-1.5 text-text-tertiary hover:text-coral-text"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </form>
    </Drawer>
  );
}
