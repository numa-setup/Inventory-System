"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Users, Loader2, Wallet, BookUser } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatTile } from "@/components/ui/StatTile";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { useToast } from "@/components/ui/Toast";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { createClient } from "@/lib/supabase/client";
import { formatPKR } from "@/lib/utils";
import { createCustomer, recordPayment } from "./actions";

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  credit_balance: number;
}

export function CustomersClient({ rows }: { rows: CustomerRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [ledgerOf, setLedgerOf] = useState<CustomerRow | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || r.name.toLowerCase().includes(t) || (r.phone ?? "").includes(t));
  }, [rows, q]);

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(r.credit_balance, 0), 0);
  const debtors = rows.filter((r) => r.credit_balance > 0).length;

  const columns: Column<CustomerRow>[] = [
    {
      key: "name", header: "Customer",
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size={34} />
          <div>
            <div className="font-medium text-text-primary">{r.name}</div>
            <div className="text-xs text-text-tertiary">{r.phone ?? "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "credit_limit", header: "Limit", align: "right", cell: (r) => <span className="tnum">{formatPKR(r.credit_limit)}</span> },
    {
      key: "credit_balance", header: "Owes (udhaar)", align: "right",
      cell: (r) => <span className={`tnum font-medium ${r.credit_balance > 0 ? "text-coral-text" : "text-text-primary"}`}>{formatPKR(r.credit_balance)}</span>,
    },
    {
      key: "status", header: "Status",
      cell: (r) =>
        r.credit_balance <= 0 ? <StatusPill tone="green">Clear</StatusPill>
        : r.credit_limit > 0 && r.credit_balance > r.credit_limit ? <StatusPill tone="coral">Over limit</StatusPill>
        : <StatusPill tone="amber">Outstanding</StatusPill>,
    },
    {
      key: "actions", header: "", align: "right",
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setLedgerOf(r)}>Khata</Button>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} customers · udhaar tracking`}
        actions={
          <div className="flex gap-2">
            <ExportMenu
              filename="customers"
              title="Customers & udhaar"
              columns={[
                { key: "name", header: "Customer" }, { key: "phone", header: "Phone" },
                { key: "credit_limit", header: "Credit limit" }, { key: "credit_balance", header: "Owes (udhaar)" },
              ]}
              rows={filtered.map((r) => ({ name: r.name, phone: r.phone ?? "", credit_limit: r.credit_limit, credit_balance: r.credit_balance }))}
            />
            <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Customer</Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total Outstanding" value={formatPKR(totalOutstanding, { compact: true })} icon={Wallet} accent="coral" />
        <StatTile label="Customers with Udhaar" value={debtors} icon={BookUser} accent="amber" />
        <StatTile label="Total Customers" value={rows.length} icon={Users} accent="blue" />
      </div>

      <Card className="mb-4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone…" className="pl-9" />
        </div>
      </Card>

      <Card><DataTable columns={columns} rows={filtered} /></Card>

      <AddCustomerDrawer open={addOpen} onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); toast("Customer added"); router.refresh(); }}
        onError={(m) => toast(m, "error")} />

      <LedgerDrawer customer={ledgerOf} onClose={() => setLedgerOf(null)}
        onPaid={() => { toast("Payment recorded"); router.refresh(); }}
        onError={(m) => toast(m, "error")} />
    </div>
  );
}

function AddCustomerDrawer({ open, onClose, onSaved, onError }: {
  open: boolean; onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", credit_limit: "0" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    if (!form.name) { setErr("Name is required."); return; }
    setSaving(true);
    const res = await createCustomer({ name: form.name, phone: form.phone, address: form.address, credit_limit: Number(form.credit_limit) || 0 });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm({ name: "", phone: "", address: "", credit_limit: "0" }); onSaved();
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add Customer"
      footer={<div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="add-cust" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
      </div>}>
      <form id="add-cust" onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input value={form.name} onChange={set("name")} placeholder="Customer name" /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={set("phone")} placeholder="03xx-xxxxxxx" /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={set("address")} placeholder="Optional" /></div>
        <div><Label>Credit limit (₨)</Label><Input type="number" value={form.credit_limit} onChange={set("credit_limit")} /></div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}

interface LedgerEntry { id: string; type: string; amount: number; reference: string | null; balance_after: number; created_at: string; }

function LedgerDrawer({ customer, onClose, onPaid, onError }: {
  customer: CustomerRow | null; onClose: () => void; onPaid: () => void; onError: (m: string) => void;
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    const sb = createClient();
    sb.from("customer_ledger")
      .select("id, type, amount, reference, balance_after, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data ?? []).map((e) => ({ ...e, amount: Number(e.amount), balance_after: Number(e.balance_after) })) as LedgerEntry[]);
        setLoading(false);
      });
  }, [customer]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !amount) return;
    setSaving(true);
    const res = await recordPayment({ customer_id: customer.id, amount: Number(amount) });
    setSaving(false);
    if (res?.error) { onError(res.error); return; }
    setAmount(""); onClose(); onPaid();
  }

  return (
    <Drawer open={!!customer} onClose={onClose} width="max-w-lg"
      title={customer ? `Khata — ${customer.name}` : "Khata"}>
      {customer && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="text-xs text-text-tertiary">Current balance (owes us)</div>
            <div className={`tnum font-heading text-2xl font-bold ${customer.credit_balance > 0 ? "text-coral-text" : "text-text-primary"}`}>
              {formatPKR(customer.credit_balance)}
            </div>
          </div>

          <form onSubmit={pay} className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Record repayment (₨)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <Button type="submit" disabled={saving || !amount}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Receive</Button>
          </form>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-text-primary">History</h4>
            {loading ? (
              <p className="text-sm text-text-tertiary">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-text-tertiary">No transactions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <div>
                      <StatusPill tone={e.type === "PAYMENT" ? "green" : "amber"}>{e.type}</StatusPill>
                      <span className="ml-2 text-xs text-text-tertiary">{new Date(e.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-right">
                      <div className="tnum font-medium text-text-primary">{formatPKR(e.amount)}</div>
                      <div className="text-[11px] text-text-tertiary">bal {formatPKR(e.balance_after)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
