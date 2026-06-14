"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatPKR } from "@/lib/utils";
import { createDiscount, toggleDiscount } from "./actions";

export interface DiscountRow {
  id: string; name: string; type: string; value: number; scope: string;
  code: string | null; min_amount: number; active: boolean;
  start_at: string | null; end_at: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  PERCENT: "% off", FIXED: "₨ off", BOGO: "Buy 1 Get 1", FREE_DELIVERY: "Free delivery",
};

export function DiscountsClient({ rows }: { rows: DiscountRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  function valueLabel(d: DiscountRow) {
    if (d.type === "PERCENT") return `${d.value}%`;
    if (d.type === "FIXED") return formatPKR(d.value);
    return TYPE_LABEL[d.type];
  }

  async function flip(d: DiscountRow) {
    const res = await toggleDiscount(d.id, !d.active);
    if (res?.error) { toast(res.error, "error"); return; }
    toast(!d.active ? "Activated" : "Deactivated");
    router.refresh();
  }

  const columns: Column<DiscountRow>[] = [
    { key: "name", header: "Name", cell: (d) => (
      <div><div className="font-medium text-text-primary">{d.name}</div>
        {d.code && <div className="text-xs text-text-tertiary">Code: {d.code}</div>}</div>
    ) },
    { key: "type", header: "Type", cell: (d) => <StatusPill tone="purple">{TYPE_LABEL[d.type]}</StatusPill> },
    { key: "value", header: "Value", align: "right", cell: (d) => <span className="tnum font-medium text-text-primary">{valueLabel(d)}</span> },
    { key: "scope", header: "Scope", cell: (d) => <span className="capitalize text-text-secondary">{d.scope.toLowerCase()}</span> },
    { key: "active", header: "Status", align: "center", cell: (d) => (
      <button onClick={() => flip(d)} className={`rounded-full px-3 py-1 text-xs font-medium ${d.active ? "bg-green-tile text-green-text" : "bg-surface-2 text-text-tertiary"}`}>
        {d.active ? "Active" : "Inactive"}
      </button>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Discounts & Sales" subtitle="Promotions across POS and the storefront"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Discount</Button>} />

      {rows.length === 0 ? (
        <Card><EmptyState icon={Tag} title="No discounts yet"
          description="Create your first promotion — percentage, fixed amount, BOGO or free delivery."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Discount</Button>} /></Card>
      ) : (
        <Card><DataTable columns={columns} rows={rows} /></Card>
      )}

      <CreateDrawer open={open} onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); toast("Discount created"); router.refresh(); }}
        onError={(m) => toast(m, "error")} />
    </div>
  );
}

function CreateDrawer({ open, onClose, onSaved, onError }: {
  open: boolean; onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: "", type: "PERCENT", value: "", scope: "CART", code: "", min_amount: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    if (!form.name) { setErr("Name required."); return; }
    setSaving(true);
    const res = await createDiscount({
      name: form.name,
      type: form.type as "PERCENT" | "FIXED" | "BOGO" | "FREE_DELIVERY",
      value: Number(form.value) || 0,
      scope: form.scope as "PRODUCT" | "CATEGORY" | "CART",
      code: form.code || null,
      min_amount: Number(form.min_amount) || 0,
    });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm({ name: "", type: "PERCENT", value: "", scope: "CART", code: "", min_amount: "" });
    onSaved();
  }

  const showValue = form.type === "PERCENT" || form.type === "FIXED";

  return (
    <Drawer open={open} onClose={onClose} title="New Discount"
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="new-disc" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button></div>}>
      <form id="new-disc" onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input value={form.name} onChange={set("name")} placeholder="e.g. Eid Sale" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={form.type} onChange={set("type")}>
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED">Fixed amount off</option>
              <option value="BOGO">Buy 1 Get 1</option>
              <option value="FREE_DELIVERY">Free delivery</option>
            </Select>
          </div>
          <div><Label>Scope</Label>
            <Select value={form.scope} onChange={set("scope")}>
              <option value="CART">Whole cart</option>
              <option value="PRODUCT">Product</option>
              <option value="CATEGORY">Category</option>
            </Select>
          </div>
        </div>
        {showValue && (
          <div><Label>{form.type === "PERCENT" ? "Percentage (%)" : "Amount (₨)"}</Label>
            <Input type="number" value={form.value} onChange={set("value")} /></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Coupon code</Label><Input value={form.code} onChange={set("code")} placeholder="Optional" /></div>
          <div><Label>Min cart (₨)</Label><Input type="number" value={form.min_amount} onChange={set("min_amount")} /></div>
        </div>
        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
