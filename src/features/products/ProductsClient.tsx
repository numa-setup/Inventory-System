"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, LayoutGrid, List as ListIcon, Package, Loader2, Barcode,
} from "lucide-react";
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
import { cn, formatPKR } from "@/lib/utils";
import { createProduct } from "./actions";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  category: string;
  base_unit: string;
  price: number;
  reorder_point: number;
  on_hand: number;
  available: number;
  avg_cost: number;
  barcode: string | null;
  active: boolean;
}

function stockTone(r: ProductRow) {
  if (r.available <= 0) return "out_of_stock";
  if (r.available <= r.reorder_point) return "low_stock";
  return "in_stock";
}

export function ProductsClient({
  rows,
  categories,
}: {
  rows: ProductRow[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<"list" | "grid">("list");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat && r.category_id !== cat) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        (r.barcode ?? "").includes(term)
      );
    });
  }, [rows, q, cat]);

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-text-tertiary">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-text-primary">{r.name}</div>
            <div className="text-xs text-text-tertiary">{r.sku}</div>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category" },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (r) => <span className="tnum text-text-primary">{formatPKR(r.price)}</span>,
    },
    {
      key: "on_hand",
      header: "On hand",
      align: "right",
      cell: (r) => <span className="tnum">{r.on_hand} {r.base_unit}</span>,
    },
    {
      key: "stock",
      header: "Status",
      cell: (r) => <StatusPill status={stockTone(r)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${rows.length} products in catalogue`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        }
      />

      {/* Filter bar */}
      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, SKU or barcode…"
            className="pl-9"
          />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-48">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            onClick={() => setView("list")}
            className={cn("rounded-md p-1.5", view === "list" ? "bg-brand-500 text-white" : "text-text-tertiary")}
            aria-label="List view"
          >
            <ListIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("grid")}
            className={cn("rounded-md p-1.5", view === "grid" ? "bg-brand-500 text-white" : "text-text-tertiary")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title="No products found"
            description="Try a different search, or add a new product."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Product</Button>}
          />
        </Card>
      ) : view === "list" ? (
        <Card>
          <DataTable columns={columns} rows={filtered} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="mb-3 flex h-28 items-center justify-center rounded-xl bg-surface-2 text-text-tertiary">
                <Package className="h-8 w-8" />
              </div>
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-medium leading-tight text-text-primary">{r.name}</h3>
                <StatusPill status={stockTone(r)} />
              </div>
              <p className="text-xs text-text-tertiary">{r.sku} · {r.category}</p>
              <div className="mt-3 flex items-end justify-between">
                <span className="tnum font-heading text-lg font-bold text-text-primary">
                  {formatPKR(r.price)}
                </span>
                <span className="text-xs text-text-tertiary">{r.on_hand} {r.base_unit}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddProductDrawer
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        onSaved={() => {
          setOpen(false);
          toast("Product added");
          router.refresh();
        }}
        onError={(m) => toast(m, "error")}
      />
    </div>
  );
}

function AddProductDrawer({
  open, onClose, categories, onSaved, onError,
}: {
  open: boolean;
  onClose: () => void;
  categories: { id: string; name: string }[];
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({
    name: "", sku: "", category_id: "", base_unit: "pcs",
    default_sale_price: "", reorder_point: "0", barcode: "",
    opening_qty: "", opening_cost: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!form.name || !form.sku) { setErr("Name and SKU are required."); return; }
    setSaving(true);
    const res = await createProduct({
      name: form.name,
      sku: form.sku,
      category_id: form.category_id || null,
      base_unit: form.base_unit || "pcs",
      default_sale_price: Number(form.default_sale_price) || 0,
      reorder_point: Number(form.reorder_point) || 0,
      barcode: form.barcode || null,
      opening_qty: form.opening_qty ? Number(form.opening_qty) : null,
      opening_cost: form.opening_cost ? Number(form.opening_cost) : null,
    });
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    setForm({ name: "", sku: "", category_id: "", base_unit: "pcs", default_sale_price: "", reorder_point: "0", barcode: "", opening_qty: "", opening_cost: "" });
    onSaved();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add Product"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-product-form" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Product
          </Button>
        </div>
      }
    >
      <form id="add-product-form" onSubmit={submit} className="space-y-4">
        <div>
          <Label>Product name *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="e.g. Sufi Cooking Oil 5L" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>SKU *</Label>
            <Input value={form.sku} onChange={set("sku")} placeholder="SKU-1009" />
          </div>
          <div>
            <Label>Base unit</Label>
            <Input value={form.base_unit} onChange={set("base_unit")} placeholder="pcs" />
          </div>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category_id} onChange={set("category_id")}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Sale price (₨)</Label>
            <Input type="number" value={form.default_sale_price} onChange={set("default_sale_price")} placeholder="0" />
          </div>
          <div>
            <Label>Reorder point</Label>
            <Input type="number" value={form.reorder_point} onChange={set("reorder_point")} />
          </div>
        </div>
        <div>
          <Label className="flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" /> Barcode</Label>
          <Input value={form.barcode} onChange={set("barcode")} placeholder="Scan or type" />
        </div>

        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">Opening stock (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.opening_qty} onChange={set("opening_qty")} placeholder="0" />
            </div>
            <div>
              <Label>Cost / unit (₨)</Label>
              <Input type="number" value={form.opening_cost} onChange={set("opening_cost")} placeholder="0" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">
            Posts a ledger receipt (Supplier → Main Store) and sets the average cost.
          </p>
        </div>

        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
