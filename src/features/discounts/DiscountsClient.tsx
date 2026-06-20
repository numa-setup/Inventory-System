"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag, Loader2, Info, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatPKR } from "@/lib/utils";
import { createDiscount, updateDiscount, toggleDiscount, deleteDiscount, type DiscountInput } from "./actions";

export interface PickerProduct { id: string; name: string }
export interface PickerCategory { id: string; name: string; parent_id: string | null }

export interface DiscountRow {
  id: string; name: string; type: string; value: number; scope: string;
  code: string | null; min_amount: number; target_id: string | null;
  buy_qty: number; get_qty: number; get_discount_percent: number;
  start_at: string | null; end_at: string | null; active: boolean; description: string | null;
  times_applied: number; total_discount: number; profit_after: number;
}

const TYPE_LABEL: Record<string, string> = {
  PERCENT: "Percentage", FIXED: "Fixed amount", BOGO: "Buy-X-Get-Y", FREE_DELIVERY: "Free delivery",
};

type Live = "active" | "scheduled" | "expired" | "inactive";
function liveState(d: DiscountRow): Live {
  if (!d.active) return "inactive";
  const now = Date.now();
  if (d.start_at && new Date(d.start_at).getTime() > now) return "scheduled";
  if (d.end_at && new Date(d.end_at).getTime() < now) return "expired";
  return "active";
}
const LIVE_TONE: Record<Live, "green" | "amber" | "neutral" | "coral"> = {
  active: "green", scheduled: "amber", expired: "neutral", inactive: "coral",
};
const LIVE_LABEL: Record<Live, string> = {
  active: "Active", scheduled: "Scheduled", expired: "Expired", inactive: "Off",
};

export function DiscountsClient({ rows, products, categories }: { rows: DiscountRow[]; products: PickerProduct[]; categories: PickerCategory[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<DiscountRow | null | "new">(null);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const prodName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  function scopeLabel(d: DiscountRow) {
    if (d.scope === "PRODUCT") return d.target_id ? prodName.get(d.target_id) ?? "Product" : "Product";
    if (d.scope === "CATEGORY") return d.target_id ? `${catName.get(d.target_id) ?? "Category"} sale` : "Category";
    return "Whole cart";
  }
  function valueLabel(d: DiscountRow) {
    if (d.type === "PERCENT") return `${d.value}%`;
    if (d.type === "FIXED") return formatPKR(d.value);
    if (d.type === "BOGO") return `Buy ${d.buy_qty} get ${d.get_qty}${d.get_discount_percent < 100 ? ` @${d.get_discount_percent}% off` : ""}`;
    return "Free delivery";
  }

  async function flip(d: DiscountRow) {
    const res = await toggleDiscount(d.id, !d.active);
    if (res?.error) return toast(res.error, "error");
    toast(!d.active ? "Activated" : "Turned off");
    router.refresh();
  }
  async function remove(d: DiscountRow) {
    if (!confirm(`Delete “${d.name}”? Its usage history is removed too.`)) return;
    const res = await deleteDiscount(d.id);
    if (res?.error) return toast(res.error, "error");
    toast("Discount deleted");
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Discounts & Sales" subtitle="Time-bound promotions across POS and the storefront"
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New Discount</Button>} />

      {/* Helper note: how this differs from a product's default discount */}
      <Card className="mb-4 flex items-start gap-3 border-brand-200 bg-brand-50/50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div className="text-sm text-text-secondary">
          <p className="font-medium text-text-primary">What goes here?</p>
          <p className="mt-0.5">
            This tab is for <strong>promotions</strong> — limited-time sales, category-wide offers, coupon codes,
            Buy-X-Get-Y and free delivery. They switch on and off by schedule and apply automatically at the till
            and at storefront checkout.
          </p>
          <p className="mt-1">
            It’s <strong>different</strong> from a product’s <em>default discount</em> (set on the product/variant),
            which is that item’s everyday discounted price. Use that for permanent markdowns; use this for campaigns.
          </p>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card><EmptyState icon={Tag} title="No discounts yet"
          description="Create your first promotion — a percentage or fixed-amount sale, a category offer, a coupon code, Buy-X-Get-Y, or free delivery."
          action={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New Discount</Button>} /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                <th className="px-4 py-2.5 text-left font-semibold">Applies to</th>
                <th className="px-4 py-2.5 text-right font-semibold">Value</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">Used</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold lg:table-cell">Given</th>
                <th className="hidden px-4 py-2.5 text-right font-semibold lg:table-cell">Profit after</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const ls = liveState(d);
                return (
                  <tr key={d.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text-primary">{d.name}</div>
                      {d.code && <div className="text-xs text-text-tertiary">Code: <span className="font-mono uppercase">{d.code}</span></div>}
                      {d.min_amount > 0 && <div className="text-xs text-text-tertiary">Min cart {formatPKR(d.min_amount)}</div>}
                    </td>
                    <td className="px-4 py-2.5"><StatusPill tone="purple">{TYPE_LABEL[d.type]}</StatusPill></td>
                    <td className="px-4 py-2.5 text-text-secondary">{scopeLabel(d)}</td>
                    <td className="px-4 py-2.5 text-right tnum font-medium text-text-primary">{valueLabel(d)}</td>
                    <td className="hidden px-4 py-2.5 text-right tnum text-text-secondary md:table-cell">{d.times_applied}</td>
                    <td className="hidden px-4 py-2.5 text-right tnum text-text-secondary lg:table-cell">{formatPKR(d.total_discount)}</td>
                    <td className="hidden px-4 py-2.5 text-right tnum text-text-secondary lg:table-cell">{formatPKR(d.profit_after)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => flip(d)} title="Toggle on/off">
                        <StatusPill tone={LIVE_TONE[ls]}>{LIVE_LABEL[ls]}</StatusPill>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(d)} title="Edit" className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(d)} title="Delete" className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-coral-text"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <EditDrawer
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        editing={editing}
        products={products}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast("Saved"); router.refresh(); }}
        onError={(m) => toast(m, "error")}
      />
    </div>
  );
}

const isoToLocal = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : "");
const localToIso = (s: string) => (s ? new Date(s).toISOString() : null);

function EditDrawer({ editing, products, categories, onClose, onSaved, onError }: {
  editing: DiscountRow | null | "new";
  products: PickerProduct[];
  categories: PickerCategory[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const open = editing !== null;
  const existing = editing && editing !== "new" ? editing : null;

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    type: existing?.type ?? "PERCENT",
    value: existing ? String(existing.value) : "",
    scope: existing?.scope ?? "CART",
    code: existing?.code ?? "",
    min_amount: existing?.min_amount ? String(existing.min_amount) : "",
    target_id: existing?.target_id ?? "",
    buy_qty: existing ? String(existing.buy_qty) : "1",
    get_qty: existing ? String(existing.get_qty) : "1",
    get_discount_percent: existing ? String(existing.get_discount_percent) : "100",
    start_at: isoToLocal(existing?.start_at ?? null),
    end_at: isoToLocal(existing?.end_at ?? null),
    description: existing?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const showValue = form.type === "PERCENT" || form.type === "FIXED";
  const isBogo = form.type === "BOGO";
  const isFreeDelivery = form.type === "FREE_DELIVERY";
  // Free delivery is inherently cart-wide; BOGO needs a product/category target.
  const effectiveScope = isFreeDelivery ? "CART" : form.scope;
  const needsTarget = (effectiveScope === "PRODUCT" || effectiveScope === "CATEGORY");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(undefined);
    setSaving(true);
    const payload: DiscountInput = {
      name: form.name,
      type: form.type as DiscountInput["type"],
      value: Number(form.value) || 0,
      scope: effectiveScope as DiscountInput["scope"],
      code: form.code || null,
      min_amount: Number(form.min_amount) || 0,
      target_id: needsTarget ? form.target_id || null : null,
      buy_qty: Number(form.buy_qty) || 1,
      get_qty: Number(form.get_qty) || 1,
      get_discount_percent: Number(form.get_discount_percent) || 100,
      start_at: localToIso(form.start_at),
      end_at: localToIso(form.end_at),
      description: form.description || null,
    };
    const res = existing ? await updateDiscount(existing.id, payload) : await createDiscount(payload);
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    onSaved();
  }

  return (
    <Drawer open={open} onClose={onClose} title={existing ? "Edit Discount" : "New Discount"} width="max-w-lg"
      footer={<div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button form="disc-form" type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} {existing ? "Save" : "Create"}</Button>
      </div>}>
      <form id="disc-form" onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input value={form.name} onChange={set("name")} placeholder="e.g. Eid Sale" /></div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={form.type} onChange={set("type")}>
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED">Fixed amount off</option>
              <option value="BOGO">Buy-X-Get-Y</option>
              <option value="FREE_DELIVERY">Free delivery</option>
            </Select>
          </div>
          <div><Label>Applies to</Label>
            <Select value={form.scope} onChange={set("scope")} disabled={isFreeDelivery}>
              <option value="CART">Whole cart</option>
              <option value="PRODUCT">A product</option>
              <option value="CATEGORY">A category (category sale)</option>
            </Select>
          </div>
        </div>

        {showValue && (
          <div><Label>{form.type === "PERCENT" ? "Percentage (%)" : "Amount off (₨)"}</Label>
            <Input type="number" value={form.value} onChange={set("value")} placeholder={form.type === "PERCENT" ? "e.g. 15" : "e.g. 200"} /></div>
        )}

        {isBogo && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <div><Label>Buy qty</Label><Input type="number" value={form.buy_qty} onChange={set("buy_qty")} /></div>
            <div><Label>Get qty</Label><Input type="number" value={form.get_qty} onChange={set("get_qty")} /></div>
            <div><Label>Get % off</Label><Input type="number" value={form.get_discount_percent} onChange={set("get_discount_percent")} /></div>
            <p className="col-span-3 text-xs text-text-tertiary">100% off = free. The “get” items must be the same product/category as the “buy”.</p>
          </div>
        )}

        {needsTarget && (
          <div><Label>{effectiveScope === "PRODUCT" ? "Product *" : "Category *"}</Label>
            <Select value={form.target_id} onChange={set("target_id")}>
              <option value="">Select…</option>
              {effectiveScope === "PRODUCT"
                ? products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
                : categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>)}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Coupon code</Label><Input value={form.code} onChange={set("code")} placeholder="Optional, e.g. EID15" />
            <p className="mt-1 text-xs text-text-tertiary">If set, it only applies when the code is entered.</p></div>
          <div><Label>Min cart (₨)</Label><Input type="number" value={form.min_amount} onChange={set("min_amount")} placeholder="0" />
            <p className="mt-1 text-xs text-text-tertiary">Only for cart / coupon / free-delivery offers.</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Starts</Label><Input type="datetime-local" value={form.start_at} onChange={set("start_at")} /></div>
          <div><Label>Ends</Label><Input type="datetime-local" value={form.end_at} onChange={set("end_at")} /></div>
        </div>
        <p className="-mt-1 text-xs text-text-tertiary">Leave dates empty to run until you turn it off. It auto-activates at the start and auto-expires at the end.</p>

        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
