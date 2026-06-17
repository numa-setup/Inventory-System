"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Package, Loader2, Barcode, ChevronRight, ChevronDown,
  Pencil, Wand2, Layers, Tag, QrCode, Upload,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { cn, formatPKR } from "@/lib/utils";
import { createProduct, updateVariant, bulkSetPrice, searchProducts, type ProductInput, type VariantInput } from "./actions";
import { PRODUCTS_PAGE_SIZE, type ProductRow, type VariantRow, type ProductsPage } from "@/lib/products-query";
import { LabelDialog, type LabelTarget } from "./LabelDialog";
import { ImportDrawer } from "./ImportDrawer";
import { ImageGallery } from "./ImageGallery";

export type { ProductRow, VariantRow };

type CatOption = { id: string; name: string; isParent: boolean };

function variantTone(v: VariantRow) {
  if (v.available <= 0) return "out_of_stock";
  if (v.available <= v.reorder_point) return "low_stock";
  return "in_stock";
}
function productStatus(p: ProductRow) {
  if (p.out) return "out_of_stock";
  if (p.low) return "low_stock";
  return "in_stock";
}

export function ProductsClient({
  initialPage,
  categories,
}: {
  initialPage: ProductsPage;
  categories: CatOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const initialQ = useSearchParams().get("q") ?? ""; // deep link from global search
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editVariant, setEditVariant] = useState<VariantRow | null>(null);
  const [labelTarget, setLabelTarget] = useState<LabelTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Debounce the search box so we hit the server (indexed columns) at most
  // ~4×/sec while typing instead of on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const isDefaultView = debouncedQ === "" && cat === "";

  const {
    data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ["products", debouncedQ, cat],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      searchProducts({
        q: debouncedQ || undefined,
        categoryId: cat || undefined,
        offset: pageParam as number,
        limit: PRODUCTS_PAGE_SIZE,
      }),
    getNextPageParam: (last) => {
      const loaded = last.offset + last.rows.length;
      return loaded < last.total ? loaded : undefined;
    },
    // Seed the default (unfiltered) view from the server-rendered first page so
    // first paint is instant and we don't refetch on mount.
    initialData: isDefaultView ? { pages: [initialPage], pageParams: [0] } : undefined,
    staleTime: 10_000,
  });

  const filtered = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? initialPage.rows, [data, initialPage.rows]);
  const total = data?.pages[0]?.total ?? initialPage.total;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refreshList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    router.refresh();
  }, [queryClient, router]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage(); },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Export reflects the full filtered set, not just the loaded pages.
  const fetchExportRows = useCallback(async () => {
    const page = await searchProducts({
      q: debouncedQ || undefined, categoryId: cat || undefined, offset: 0, limit: 10_000,
    });
    return page.rows.flatMap((p) =>
      p.variants.map((v) => ({
        product: p.name, brand: p.brand ?? "", category: p.category, variant: v.label,
        sku: v.sku, barcode: v.barcode ?? "", cost: Math.round(v.avg_cost || v.cost),
        price: v.sale_price, on_hand: v.on_hand,
      })),
    );
  }, [debouncedQ, cat]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${total} product${total === 1 ? "" : "s"}${isDefaultView ? "" : " match"}`}
        actions={
          <div className="flex gap-2">
            <ExportMenu
              filename="products"
              title="Products & variants"
              columns={[
                { key: "product", header: "Product" }, { key: "brand", header: "Brand" },
                { key: "category", header: "Category" }, { key: "variant", header: "Variant" },
                { key: "sku", header: "SKU" }, { key: "barcode", header: "Barcode" },
                { key: "cost", header: "Avg cost" }, { key: "price", header: "Price" },
                { key: "on_hand", header: "On hand" },
              ]}
              rows={[]}
              fetchRows={fetchExportRows}
            />
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product, brand, SKU or barcode…"
            className="pl-9"
          />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-64">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Card>

      {isLoading ? (
        <Card className="flex items-center justify-center py-16 text-sm text-text-tertiary">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading products…
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title="No products found"
            description="Try a different search, or add a new product."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Product</Button>}
          />
        </Card>
      ) : (
        <Card className={cn("overflow-hidden transition-opacity", isFetching && !isFetchingNextPage && "opacity-60")}>
          {/* header */}
          <div className="hidden border-b border-border bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary sm:grid sm:grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.7fr_2.2rem]">
            <span>Product</span>
            <span>Category</span>
            <span className="text-right">Price</span>
            <span className="text-right">On hand</span>
            <span>Status</span>
            <span />
          </div>
          {filtered.map((p) => (
            <ProductGroup
              key={p.id}
              p={p}
              isOpen={expanded.has(p.id)}
              onToggle={() => toggle(p.id)}
              onEditVariant={(v) => setEditVariant(v)}
              onLabel={(v) => setLabelTarget({
                variant_id: v.id, product_id: p.id, name: p.name, label: v.label,
                sku: v.sku, sale_price: v.sale_price, barcode: v.barcode,
                is_variable_weight: p.is_variable_weight,
              })}
              onImageChanged={refreshList}
              onBulkPrice={async (price) => {
                const res = await bulkSetPrice(p.id, price);
                if (res?.error) return toast(res.error, "error");
                toast("Prices updated for all variants");
                refreshList();
              }}
            />
          ))}
          {/* infinite-scroll sentinel + manual fallback */}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />} Load more
              </Button>
            </div>
          )}
        </Card>
      )}

      <AddProductDrawer
        open={open}
        onClose={() => setOpen(false)}
        categories={categories}
        onSaved={() => { setOpen(false); toast("Product added"); refreshList(); }}
        onError={(m) => toast(m, "error")}
      />

      <VariantEditDrawer
        variant={editVariant}
        onClose={() => setEditVariant(null)}
        onSaved={() => { setEditVariant(null); toast("Variant updated"); refreshList(); }}
        onError={(m) => toast(m, "error")}
      />

      <LabelDialog
        target={labelTarget}
        onClose={() => setLabelTarget(null)}
        onChanged={refreshList}
      />

      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} onDone={refreshList} />
    </div>
  );
}

/* ---------------- Expandable product group ---------------- */

function ProductGroup({
  p, isOpen, onToggle, onEditVariant, onLabel, onBulkPrice, onImageChanged,
}: {
  p: ProductRow;
  isOpen: boolean;
  onToggle: () => void;
  onEditVariant: (v: VariantRow) => void;
  onLabel: (v: VariantRow) => void;
  onBulkPrice: (price: number) => void;
  onImageChanged: () => void;
}) {
  const [bulk, setBulk] = useState("");
  const price = p.price_min === p.price_max
    ? formatPKR(p.price_min)
    : `${formatPKR(p.price_min)} – ${formatPKR(p.price_max)}`;

  return (
    <div className="border-b border-border/70 last:border-0">
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.7fr_2.2rem]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-text-tertiary">
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-text-primary">{p.name}</span>
              {p.has_variants && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-tile px-2 py-0.5 text-[11px] font-medium text-purple-text">
                  <Layers className="h-3 w-3" /> {p.variant_count}
                </span>
              )}
            </div>
            <div className="truncate text-xs text-text-tertiary">
              {p.brand ? `${p.brand} · ` : ""}{p.sku}
            </div>
          </div>
        </div>
        <span className="hidden text-sm text-text-secondary sm:block">{p.category}</span>
        <span className="hidden tnum text-right text-sm text-text-primary sm:block">{price}</span>
        <span className="hidden tnum text-right text-sm text-text-secondary sm:block">{p.on_hand} {p.base_unit}</span>
        <span className="hidden sm:block"><StatusPill status={productStatus(p)} /></span>
        <span className="flex justify-end text-text-tertiary">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {isOpen && (
        <div className="bg-surface-2/50 px-4 pb-4 pt-1">
          <div className="pt-3">
            <ImageGallery productId={p.id} onChanged={onImageChanged} />
          </div>
          {/* bulk price */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Tag className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="text-xs text-text-secondary">Set price for all variants:</span>
            <Input
              type="number"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder="₨"
              className="h-8 w-28"
            />
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={!bulk}
              onClick={() => { onBulkPrice(Number(bulk)); setBulk(""); }}
            >
              Apply
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="px-3 py-2 text-left font-semibold">Variant</th>
                  <th className="px-3 py-2 text-left font-semibold">SKU / Barcode</th>
                  <th className="px-3 py-2 text-right font-semibold">Cost</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">On hand</th>
                  <th className="px-3 py-2 text-right font-semibold">Reorder</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {p.variants.map((v) => (
                  <tr key={v.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-text-primary">{v.label}</td>
                    <td className="px-3 py-2 text-text-secondary">
                      <div>{v.sku}</div>
                      {v.barcode && (
                        <div className="flex items-center gap-1 text-xs text-text-tertiary">
                          <Barcode className="h-3 w-3" /> {v.barcode}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tnum text-text-secondary">{formatPKR(v.avg_cost || v.cost)}</td>
                    <td className="px-3 py-2 text-right tnum text-text-primary">{formatPKR(v.sale_price)}</td>
                    <td className="px-3 py-2 text-right tnum">{v.on_hand}</td>
                    <td className="px-3 py-2 text-right tnum text-text-tertiary">{v.reorder_point}</td>
                    <td className="px-3 py-2"><StatusPill status={variantTone(v)} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onLabel(v)}
                          title={v.barcode ? "Print label" : "Generate barcode & print label"}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-2"
                        >
                          <QrCode className="h-3 w-3" /> Label
                        </button>
                        <button
                          onClick={() => onEditVariant(v)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-2"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Variant edit drawer ---------------- */

function VariantEditDrawer({
  variant, onClose, onSaved, onError,
}: {
  variant: VariantRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ sale_price: "", cost: "", reorder_point: "" });
  const [saving, setSaving] = useState(false);

  // sync when a new variant is opened
  const [lastId, setLastId] = useState<string | null>(null);
  if (variant && variant.id !== lastId) {
    setLastId(variant.id);
    setForm({
      sale_price: String(variant.sale_price),
      cost: String(variant.cost),
      reorder_point: String(variant.reorder_point),
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!variant) return;
    setSaving(true);
    const res = await updateVariant(variant.id, {
      sale_price: Number(form.sale_price) || 0,
      cost: Number(form.cost) || 0,
      reorder_point: Number(form.reorder_point) || 0,
    });
    setSaving(false);
    if (res?.error) return onError(res.error);
    onSaved();
  }

  return (
    <Drawer
      open={!!variant}
      onClose={onClose}
      title={variant ? `Edit · ${variant.label}` : "Edit variant"}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-variant-form" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      }
    >
      <form id="edit-variant-form" onSubmit={submit} className="space-y-4">
        <p className="text-xs text-text-tertiary">
          {variant?.sku}{variant?.barcode ? ` · ${variant.barcode}` : ""}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Sale price (₨)</Label>
            <Input type="number" value={form.sale_price} onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))} />
          </div>
          <div>
            <Label>Standard cost (₨)</Label>
            <Input type="number" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Reorder point</Label>
          <Input type="number" value={form.reorder_point} onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))} />
        </div>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-text-tertiary">
          On-hand quantity isn’t edited here — it changes only through the Stock area
          (every movement is recorded in the ledger).
        </p>
      </form>
    </Drawer>
  );
}

/* ---------------- Add product drawer (with matrix generator) ---------------- */

interface VariantDraft {
  combo: string[];
  sku: string;
  barcode: string;
  sale_price: string;
  cost: string;
  reorder: string;
  opening_qty: string;
}

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])),
    [[]],
  );
}

function AddProductDrawer({
  open, onClose, categories, onSaved, onError,
}: {
  open: boolean;
  onClose: () => void;
  categories: CatOption[];
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [base, setBase] = useState({ name: "", brand: "", category_id: "", base_sku: "", base_price: "", description: "" });
  const [hasVariants, setHasVariants] = useState(false);
  const [single, setSingle] = useState({ sku: "", barcode: "", cost: "", reorder: "3", opening_qty: "" });
  const [options, setOptions] = useState<{ name: string; values: string }[]>([{ name: "", values: "" }]);
  const [matrix, setMatrix] = useState<VariantDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  const reset = () => {
    setBase({ name: "", brand: "", category_id: "", base_sku: "", base_price: "", description: "" });
    setHasVariants(false);
    setSingle({ sku: "", barcode: "", cost: "", reorder: "3", opening_qty: "" });
    setOptions([{ name: "", values: "" }]);
    setMatrix([]);
    setErr(undefined);
  };

  const definedOptions = options
    .map((o) => ({ name: o.name.trim(), values: o.values.split(",").map((v) => v.trim()).filter(Boolean) }))
    .filter((o) => o.name && o.values.length);

  function generate() {
    if (!definedOptions.length) { setErr("Add at least one option with values."); return; }
    setErr(undefined);
    const combos = cartesian(definedOptions.map((o) => o.values));
    const baseSku = base.base_sku.trim() || "SKU";
    setMatrix(
      combos.map((combo, i) => ({
        combo,
        sku: `${baseSku}-${i + 1}`,
        barcode: "",
        sale_price: base.base_price || "",
        cost: "",
        reorder: "3",
        opening_qty: "",
      })),
    );
  }

  const setMatrixField = (i: number, k: keyof VariantDraft, val: string) =>
    setMatrix((m) => m.map((row, idx) => (idx === i ? { ...row, [k]: val } : row)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!base.name) { setErr("Product name is required."); return; }

    let payload: ProductInput;
    if (!hasVariants) {
      if (!single.sku) { setErr("SKU is required."); return; }
      const v: VariantInput = {
        sku: single.sku,
        barcode: single.barcode || null,
        sale_price: Number(base.base_price) || 0,
        cost: Number(single.cost) || 0,
        reorder_point: Number(single.reorder) || 0,
        opening_qty: single.opening_qty ? Number(single.opening_qty) : null,
        option_values: [],
      };
      payload = {
        name: base.name, brand: base.brand || null, category_id: base.category_id || null,
        description: base.description || null, base_price: Number(base.base_price) || 0,
        has_variants: false, options: [], variants: [v],
      };
    } else {
      if (!matrix.length) { setErr("Generate the variant matrix first."); return; }
      if (matrix.some((m) => !m.sku)) { setErr("Every variant needs a SKU."); return; }
      payload = {
        name: base.name, brand: base.brand || null, category_id: base.category_id || null,
        description: base.description || null, base_price: Number(base.base_price) || 0,
        has_variants: true,
        options: definedOptions,
        variants: matrix.map((m) => ({
          sku: m.sku,
          barcode: m.barcode || null,
          sale_price: Number(m.sale_price) || Number(base.base_price) || 0,
          cost: Number(m.cost) || 0,
          reorder_point: Number(m.reorder) || 0,
          opening_qty: m.opening_qty ? Number(m.opening_qty) : null,
          option_values: m.combo,
        })),
      };
    }

    setSaving(true);
    const res = await createProduct(payload);
    setSaving(false);
    if (res?.error) { setErr(res.error); onError(res.error); return; }
    reset();
    onSaved();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add Product"
      width="max-w-2xl"
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
          <Input value={base.name} onChange={(e) => setBase((b) => ({ ...b, name: e.target.value }))} placeholder="e.g. Maybelline SuperStay Lipstick" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Brand</Label>
            <Input value={base.brand} onChange={(e) => setBase((b) => ({ ...b, brand: e.target.value }))} placeholder="e.g. Maybelline" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={base.category_id} onChange={(e) => setBase((b) => ({ ...b, category_id: e.target.value }))}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Base SKU</Label>
            <Input value={base.base_sku} onChange={(e) => setBase((b) => ({ ...b, base_sku: e.target.value }))} placeholder="COS-LIP-02" />
          </div>
          <div>
            <Label>Base price (₨)</Label>
            <Input type="number" value={base.base_price} onChange={(e) => setBase((b) => ({ ...b, base_price: e.target.value }))} placeholder="0" />
          </div>
        </div>

        {/* variant toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
          <div>
            <p className="text-sm font-medium text-text-primary">This product has variants</p>
            <p className="text-xs text-text-tertiary">Size, Shade, Flavor, Color…</p>
          </div>
          <button
            type="button"
            onClick={() => setHasVariants((v) => !v)}
            className={cn("relative h-6 w-11 rounded-full transition-colors", hasVariants ? "bg-brand-500" : "bg-border")}
            aria-pressed={hasVariants}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", hasVariants ? "left-[1.375rem]" : "left-0.5")} />
          </button>
        </div>

        {!hasVariants ? (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU *</Label>
                <Input value={single.sku} onChange={(e) => setSingle((s) => ({ ...s, sku: e.target.value }))} placeholder="GFT-BOX-02" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" /> Barcode</Label>
                <Input value={single.barcode} onChange={(e) => setSingle((s) => ({ ...s, barcode: e.target.value }))} placeholder="Scan or type" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Cost (₨)</Label>
                <Input type="number" value={single.cost} onChange={(e) => setSingle((s) => ({ ...s, cost: e.target.value }))} />
              </div>
              <div>
                <Label>Reorder</Label>
                <Input type="number" value={single.reorder} onChange={(e) => setSingle((s) => ({ ...s, reorder: e.target.value }))} />
              </div>
              <div>
                <Label>Opening qty</Label>
                <Input type="number" value={single.opening_qty} onChange={(e) => setSingle((s) => ({ ...s, opening_qty: e.target.value }))} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* options builder */}
            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-medium text-text-secondary">Options (up to 2)</p>
              {options.map((o, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_1.6fr] gap-2">
                  <Input
                    value={o.name}
                    onChange={(e) => setOptions((arr) => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    placeholder={i === 0 ? "Shade" : "Size"}
                  />
                  <Input
                    value={o.values}
                    onChange={(e) => setOptions((arr) => arr.map((x, idx) => idx === i ? { ...x, values: e.target.value } : x))}
                    placeholder="Comma separated: Ruby Red, Nude, Coral"
                  />
                </div>
              ))}
              {options.length < 2 && (
                <button type="button" onClick={() => setOptions((a) => [...a, { name: "", values: "" }])} className="text-xs font-medium text-brand-600 hover:underline">
                  + Add option
                </button>
              )}
              <div className="mt-3">
                <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={generate}>
                  <Wand2 className="h-3.5 w-3.5" /> Generate variants
                </Button>
              </div>
            </div>

            {/* matrix */}
            {matrix.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-text-tertiary">
                      <th className="px-2 py-2 text-left font-semibold">Variant</th>
                      <th className="px-2 py-2 text-left font-semibold">SKU</th>
                      <th className="px-2 py-2 text-left font-semibold">Barcode</th>
                      <th className="px-2 py-2 text-right font-semibold">Price</th>
                      <th className="px-2 py-2 text-right font-semibold">Cost</th>
                      <th className="px-2 py-2 text-right font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((m, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="whitespace-nowrap px-2 py-1.5 font-medium text-text-primary">{m.combo.join(" / ")}</td>
                        <td className="px-2 py-1.5"><Input value={m.sku} onChange={(e) => setMatrixField(i, "sku", e.target.value)} className="h-7 w-24 text-xs" /></td>
                        <td className="px-2 py-1.5"><Input value={m.barcode} onChange={(e) => setMatrixField(i, "barcode", e.target.value)} className="h-7 w-28 text-xs" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={m.sale_price} onChange={(e) => setMatrixField(i, "sale_price", e.target.value)} className="h-7 w-16 text-xs" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={m.cost} onChange={(e) => setMatrixField(i, "cost", e.target.value)} className="h-7 w-16 text-xs" /></td>
                        <td className="px-2 py-1.5"><Input type="number" value={m.opening_qty} onChange={(e) => setMatrixField(i, "opening_qty", e.target.value)} className="h-7 w-14 text-xs" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <FieldError message={err} />
      </form>
    </Drawer>
  );
}
