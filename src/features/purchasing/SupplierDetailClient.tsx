"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, CreditCard, FileText, Wallet,
  Loader2, Receipt, Package, Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatPKR } from "@/lib/utils";
import { recordSupplierPayment, updateSupplier, type SupplierInput } from "./actions";

interface Supplier {
  id: string; name: string; contact_person: string | null; phone: string | null;
  email: string | null; address: string | null; city: string | null; ntn: string | null;
  payment_terms: string | null; bank_details: string | null;
  opening_balance: number; balance: number; notes: string | null;
}
interface Ledger { id: string; type: string; amount: number; reference: string | null; balance_after: number; created_at: string; }
interface Receipt { id: string; grn_no: string; total: number; created_at: string; }
interface PO { id: string; po_no: string; status: string; total: number; expected_at: string | null; created_at: string; }
interface Supplied { name: string; label: string; sku: string; qty: number; lastCost: number; }

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

export function SupplierDetailClient({
  supplier, ledger, receipts, pos, supplied,
}: {
  supplier: Supplier;
  ledger: Ledger[];
  receipts: Receipt[];
  pos: PO[];
  supplied: Supplied[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState(false);
  type Tab = "ledger" | "history" | "products";
  const [tab, setTab] = useState<Tab>("ledger");

  const ledgerCols: Column<Ledger>[] = [
    { key: "created_at", header: "Date", cell: (l) => fmtDate(l.created_at) },
    { key: "type", header: "Type", cell: (l) => <StatusPill tone={l.type === "PAYMENT" ? "green" : "amber"}>{l.type === "PAYMENT" ? "Payment" : "Charge"}</StatusPill> },
    { key: "reference", header: "Reference", cell: (l) => l.reference ?? "—" },
    { key: "amount", header: "Amount", align: "right", cell: (l) => <span className={l.type === "PAYMENT" ? "tnum text-green-text" : "tnum text-coral-text"}>{l.type === "PAYMENT" ? "−" : "+"}{formatPKR(l.amount)}</span> },
    { key: "balance_after", header: "Balance", align: "right", cell: (l) => <span className="tnum text-text-secondary">{formatPKR(l.balance_after)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.city ?? "Supplier"}
        actions={
          <div className="flex gap-2">
            <Link href="/purchasing"><Button variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
            <Button variant="secondary" size="sm" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Button size="sm" onClick={() => setPay(true)}><Wallet className="h-4 w-4" /> Record Payment</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* profile + balance */}
        <div className="space-y-4">
          <StatTile label="Payable balance" value={formatPKR(supplier.balance)} icon={Wallet} accent={supplier.balance > 0 ? "coral" : "green"} hint={supplier.balance > 0 ? "We owe this supplier" : "Settled"} />
          <Card className="space-y-3 p-4 text-sm">
            <Field icon={Building2} label="Contact person" value={supplier.contact_person} />
            <Field icon={Phone} label="Phone" value={supplier.phone} />
            <Field icon={Mail} label="Email" value={supplier.email} />
            <Field icon={MapPin} label="Address" value={[supplier.address, supplier.city].filter(Boolean).join(", ") || null} />
            <Field icon={FileText} label="NTN / Tax #" value={supplier.ntn} />
            <Field icon={Receipt} label="Payment terms" value={supplier.payment_terms} />
            <Field icon={CreditCard} label="Bank details" value={supplier.bank_details} />
            {supplier.notes && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-secondary">{supplier.notes}</p>}
          </Card>
        </div>

        {/* tabs */}
        <div>
          <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1">
            {([["ledger", "Ledger"], ["history", "Purchase History"], ["products", "Products"]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === k ? "bg-brand-500 text-white" : "text-text-secondary hover:bg-surface-2"}`}>{label}</button>
            ))}
          </div>

          {tab === "ledger" && (
            <Card>
              <DataTable columns={ledgerCols} rows={ledger} empty={<EmptyState icon={Wallet} title="No ledger entries" description="Charges from receipts and your payments appear here." />} />
            </Card>
          )}

          {tab === "history" && (
            <div className="space-y-4">
              <Card>
                <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-secondary">Goods receipts</div>
                <DataTable
                  columns={[
                    { key: "grn_no", header: "GRN #", cell: (r: Receipt) => <span className="font-medium text-text-primary">{r.grn_no}</span> },
                    { key: "created_at", header: "Date", cell: (r: Receipt) => fmtDate(r.created_at) },
                    { key: "total", header: "Value", align: "right", cell: (r: Receipt) => <span className="tnum">{formatPKR(r.total)}</span> },
                  ]}
                  rows={receipts}
                  empty={<span className="text-sm text-text-tertiary">No receipts yet.</span>}
                />
              </Card>
              <Card>
                <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-secondary">Purchase orders</div>
                <DataTable
                  columns={[
                    { key: "po_no", header: "PO #", cell: (p: PO) => <span className="font-medium text-text-primary">{p.po_no}</span> },
                    { key: "created_at", header: "Date", cell: (p: PO) => fmtDate(p.created_at) },
                    { key: "status", header: "Status", cell: (p: PO) => <StatusPill status={p.status.toLowerCase()} /> },
                    { key: "total", header: "Total", align: "right", cell: (p: PO) => <span className="tnum">{formatPKR(p.total)}</span> },
                  ]}
                  rows={pos}
                  empty={<span className="text-sm text-text-tertiary">No purchase orders.</span>}
                />
              </Card>
            </div>
          )}

          {tab === "products" && (
            <Card>
              <DataTable
                columns={[
                  { key: "name", header: "Product", cell: (s: Supplied) => <div><div className="font-medium text-text-primary">{s.name}</div><div className="text-xs text-text-tertiary">{s.label} · {s.sku}</div></div> },
                  { key: "qty", header: "Total received", align: "right", cell: (s: Supplied) => <span className="tnum">{s.qty}</span> },
                  { key: "lastCost", header: "Last cost", align: "right", cell: (s: Supplied) => <span className="tnum">{formatPKR(s.lastCost)}</span> },
                ]}
                rows={supplied.map((s, i) => ({ ...s, id: i }))}
                empty={<EmptyState icon={Package} title="No products received yet" description="Items received from this supplier will be listed here." />}
              />
            </Card>
          )}
        </div>
      </div>

      <PaymentDrawer
        open={pay}
        balance={supplier.balance}
        onClose={() => setPay(false)}
        onSaved={() => { setPay(false); toast("Payment recorded"); router.refresh(); }}
        onError={(m) => toast(m, "error")}
        supplierId={supplier.id}
      />

      <EditSupplierDrawer
        open={edit}
        supplier={supplier}
        onClose={() => setEdit(false)}
        onSaved={() => { setEdit(false); toast("Supplier updated"); router.refresh(); }}
        onError={(m) => toast(m, "error")}
      />
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      <div>
        <div className="text-xs text-text-tertiary">{label}</div>
        <div className="text-text-primary">{value ?? "—"}</div>
      </div>
    </div>
  );
}

function PaymentDrawer({
  open, balance, supplierId, onClose, onSaved, onError,
}: {
  open: boolean; balance: number; supplierId: string;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!amount || Number(amount) <= 0) { setErr("Enter an amount."); return; }
    setSaving(true);
    const res = await recordSupplierPayment({ supplier_id: supplierId, amount: Number(amount), reference });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setAmount(""); setReference("");
    onSaved();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Record Payment" footer={
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="pay-form" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Record</Button>
      </div>
    }>
      <form id="pay-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <div className="flex justify-between"><span className="text-text-tertiary">Current payable</span><span className="tnum font-medium text-coral-text">{formatPKR(balance)}</span></div>
        </div>
        <div><Label>Amount (₨)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
        <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cash / cheque / transfer #" /></div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

function EditSupplierDrawer({
  open, supplier, onClose, onSaved, onError,
}: {
  open: boolean; supplier: Supplier;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState<SupplierInput>({
    name: supplier.name, contact_person: supplier.contact_person ?? "", phone: supplier.phone ?? "",
    email: supplier.email ?? "", address: supplier.address ?? "", city: supplier.city ?? "",
    ntn: supplier.ntn ?? "", payment_terms: supplier.payment_terms ?? "", bank_details: supplier.bank_details ?? "",
    notes: supplier.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof SupplierInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!form.name?.trim()) { setErr("Company name is required."); return; }
    setSaving(true);
    const res = await updateSupplier(supplier.id, form);
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    onSaved();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit Supplier" width="max-w-lg" footer={
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="edit-supplier-form" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
      </div>
    }>
      <form id="edit-supplier-form" onSubmit={submit} className="space-y-4">
        <div><Label>Company name *</Label><Input value={form.name} onChange={set("name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contact person</Label><Input value={form.contact_person ?? ""} onChange={set("contact_person")} /></div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={set("phone")} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input value={form.email ?? ""} onChange={set("email")} /></div>
          <div><Label>City</Label><Input value={form.city ?? ""} onChange={set("city")} /></div>
        </div>
        <div><Label>Address</Label><Input value={form.address ?? ""} onChange={set("address")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>NTN / Tax #</Label><Input value={form.ntn ?? ""} onChange={set("ntn")} /></div>
          <div><Label>Payment terms</Label><Input value={form.payment_terms ?? ""} onChange={set("payment_terms")} /></div>
        </div>
        <div><Label>Bank details</Label><Input value={form.bank_details ?? ""} onChange={set("bank_details")} /></div>
        <div><Label>Notes</Label><Input value={form.notes ?? ""} onChange={set("notes")} /></div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
