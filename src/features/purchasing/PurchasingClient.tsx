"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck, Loader2, PackageCheck, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatPKR } from "@/lib/utils";
import { createSupplier, receiveStock } from "./actions";

interface Supplier { id: string; name: string; phone: string | null; address: string | null }
interface Product { id: string; sku: string; name: string; base_unit: string }
interface Receipt { id: string; grn_no: string; created_at: string; supplier: string }

export function PurchasingClient({
  suppliers, products, receipts,
}: {
  suppliers: Supplier[]; products: Product[]; receipts: Receipt[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [addSup, setAddSup] = useState(false);
  const [receive, setReceive] = useState(false);

  const supColumns: Column<Supplier>[] = [
    { key: "name", header: "Supplier", cell: (s) => <span className="font-medium text-text-primary">{s.name}</span> },
    { key: "phone", header: "Phone", cell: (s) => s.phone ? <span className="flex items-center gap-1.5 text-text-secondary"><Phone className="h-3.5 w-3.5" />{s.phone}</span> : "—" },
    { key: "address", header: "Address", cell: (s) => s.address ?? "—" },
  ];
  const recColumns: Column<Receipt>[] = [
    { key: "grn_no", header: "GRN", cell: (r) => <span className="font-medium text-text-primary">{r.grn_no}</span> },
    { key: "supplier", header: "Supplier" },
    { key: "created_at", header: "Date", align: "right", cell: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div>
      <PageHeader
        title="Purchasing"
        subtitle="Suppliers & goods receiving"
        actions={
          <>
            <Button variant="secondary" onClick={() => setAddSup(true)}><Plus className="h-4 w-4" /> Supplier</Button>
            <Button onClick={() => setReceive(true)}><PackageCheck className="h-4 w-4" /> Receive Stock</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Suppliers</CardTitle></CardHeader>
          {suppliers.length === 0 ? (
            <EmptyState icon={Truck} title="No suppliers yet" description="Add your first supplier." />
          ) : <DataTable columns={supColumns} rows={suppliers} />}
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Goods Receipts</CardTitle></CardHeader>
          {receipts.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No receipts yet" description="Receive stock to record purchases." />
          ) : <DataTable columns={recColumns} rows={receipts} />}
        </Card>
      </div>

      <AddSupplierDrawer open={addSup} onClose={() => setAddSup(false)}
        onSaved={() => { setAddSup(false); toast("Supplier added"); router.refresh(); }}
        onError={(m) => toast(m, "error")} />

      <ReceiveDrawer open={receive} onClose={() => setReceive(false)} suppliers={suppliers} products={products}
        onSaved={(grn) => { setReceive(false); toast(`Received — ${grn}`); router.refresh(); }}
        onError={(m) => toast(m, "error")} />
    </div>
  );
}

function AddSupplierDrawer({ open, onClose, onSaved, onError }: {
  open: boolean; onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    if (!form.name) { setErr("Name required."); return; }
    setSaving(true);
    const res = await createSupplier(form);
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm({ name: "", phone: "", address: "" }); onSaved();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add Supplier"
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="add-sup" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button></div>}>
      <form id="add-sup" onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input value={form.name} onChange={set("name")} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={set("phone")} /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

function ReceiveDrawer({ open, onClose, suppliers, products, onSaved, onError }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]; products: Product[];
  onSaved: (grn: string) => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ supplier_id: "", product_id: "", qty: "", unit_cost: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    if (!form.product_id) { setErr("Select a product."); return; }
    if (!form.qty || Number(form.qty) <= 0) { setErr("Enter quantity."); return; }
    setSaving(true);
    const res = await receiveStock({
      supplier_id: form.supplier_id || null,
      product_id: form.product_id,
      qty: Number(form.qty),
      unit_cost: Number(form.unit_cost) || 0,
    });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm({ supplier_id: "", product_id: "", qty: "", unit_cost: "" });
    onSaved(res.grn_no ?? "");
  }

  return (
    <Drawer open={open} onClose={onClose} title="Receive Stock"
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="receive" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Receive</Button></div>}>
      <form id="receive" onSubmit={submit} className="space-y-4">
        <div><Label>Supplier</Label>
          <Select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
            <option value="">— None —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div><Label>Product *</Label>
          <Select value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
            <option value="">— Select —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} /></div>
          <div><Label>Cost / unit (₨)</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))} /></div>
        </div>
        {form.qty && form.unit_cost && (
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <div className="flex justify-between"><span className="text-text-tertiary">Total cost</span>
              <span className="tnum font-medium">{formatPKR(Number(form.qty) * Number(form.unit_cost))}</span></div>
          </div>
        )}
        <FieldError message={err} />
        <p className="text-[11px] text-text-tertiary">Posts a ledger receipt (Supplier → Main) and updates the weighted-average cost.</p>
      </form>
    </Drawer>
  );
}
