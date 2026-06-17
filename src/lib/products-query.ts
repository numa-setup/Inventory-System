import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side paginated products query. Both the SSR page (first page) and the
// "load more" / search server action call this, so a product list never loads
// the whole table: each call fetches one page of products plus the related
// variants / barcodes / availability / option labels for ONLY those product ids.

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  label: string;
  cost: number;
  sale_price: number;
  reorder_point: number;
  is_default: boolean;
  active: boolean;
  barcode: string | null;
  on_hand: number;
  available: number;
  avg_cost: number;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  category: string;
  base_unit: string;
  has_variants: boolean;
  is_variable_weight: boolean;
  active: boolean;
  variants: VariantRow[];
  variant_count: number;
  on_hand: number;
  stock_value: number;
  price_min: number;
  price_max: number;
  low: boolean;
  out: boolean;
}

export interface ProductsPage {
  rows: ProductRow[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProductsQuery {
  q?: string;
  categoryId?: string;
  offset?: number;
  limit?: number;
}

export const PRODUCTS_PAGE_SIZE = 20;

/** Sanitize a search term for a PostgREST `or(...ilike...)` filter. */
function sanitize(q: string) {
  return q.replace(/[(),%*]/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchProductsPage(supabase: SupabaseClient<any>, params: ProductsQuery = {}): Promise<ProductsPage> {
  const limit = params.limit ?? PRODUCTS_PAGE_SIZE;
  const offset = params.offset ?? 0;
  const term = params.q ? sanitize(params.q) : "";

  // 1. one page of parent products (filtered + counted, bounded by range)
  let pq = supabase
    .from("products")
    .select("id, sku, name, brand, category_id, base_unit, default_sale_price, has_variants, is_variable_weight, active, image_url", {
      count: "exact",
    })
    .order("name")
    .order("id")
    .range(offset, offset + limit - 1);
  if (params.categoryId) pq = pq.eq("category_id", params.categoryId);
  if (term) pq = pq.or(`name.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`);

  const { data: products, count, error } = await pq;
  if (error) throw error;

  const ids = (products ?? []).map((p) => p.id as string);
  if (!ids.length) return { rows: [], total: count ?? 0, offset, limit };

  // 2. related rows for ONLY this page's products
  const [{ data: categories }, { data: variants }, { data: options }, { data: optionValues }] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id"),
    supabase
      .from("product_variants")
      .select("id, product_id, sku, cost, sale_price, reorder_point, is_default, active")
      .in("product_id", ids)
      .order("is_default", { ascending: false }),
    supabase.from("product_options").select("id, product_id, name, sort").in("product_id", ids).order("sort"),
    supabase.from("product_option_values").select("id, option_id, value, sort"),
  ]);

  const variantIds = (variants ?? []).map((v) => v.id as string);
  const [{ data: availability }, { data: barcodes }, { data: vov }] = await Promise.all([
    supabase.from("variant_availability").select("variant_id, on_hand, reserved, available, avg_cost").in("variant_id", variantIds),
    supabase.from("product_barcodes").select("variant_id, barcode, is_primary").in("variant_id", variantIds),
    supabase.from("variant_option_values").select("variant_id, option_value_id").in("variant_id", variantIds),
  ]);

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name as string]));
  const availMap = new Map((availability ?? []).map((a) => [a.variant_id, a]));
  const barcodeMap = new Map<string, string>();
  for (const b of barcodes ?? []) {
    if (!barcodeMap.has(b.variant_id) || b.is_primary) barcodeMap.set(b.variant_id, b.barcode as string);
  }

  const valLabel = new Map((optionValues ?? []).map((v) => [v.id, v.value as string]));
  const variantLabels = new Map<string, string[]>();
  for (const link of vov ?? []) {
    const val = valLabel.get(link.option_value_id);
    if (!val) continue;
    const arr = variantLabels.get(link.variant_id) ?? [];
    arr.push(val);
    variantLabels.set(link.variant_id, arr);
  }
  void options; // option names not needed for the label join here

  const variantsByProduct = new Map<string, VariantRow[]>();
  for (const v of variants ?? []) {
    const av = availMap.get(v.id);
    const row: VariantRow = {
      id: v.id,
      product_id: v.product_id,
      sku: v.sku,
      label: (variantLabels.get(v.id) ?? []).join(" / ") || (v.is_default ? "Default" : v.sku),
      cost: Number(v.cost),
      sale_price: Number(v.sale_price),
      reorder_point: Number(v.reorder_point),
      is_default: v.is_default,
      active: v.active,
      barcode: barcodeMap.get(v.id) ?? null,
      on_hand: av ? Number(av.on_hand) : 0,
      available: av ? Number(av.available) : 0,
      avg_cost: av ? Number(av.avg_cost) : 0,
    };
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push(row);
    variantsByProduct.set(v.product_id, arr);
  }

  const rows: ProductRow[] = (products ?? []).map((p) => {
    const vs = variantsByProduct.get(p.id) ?? [];
    const prices = vs.map((v) => v.sale_price).filter((n) => n > 0);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand ?? null,
      category_id: p.category_id,
      category: p.category_id ? catName.get(p.category_id) ?? "—" : "—",
      base_unit: p.base_unit,
      has_variants: p.has_variants,
      is_variable_weight: p.is_variable_weight,
      active: p.active,
      variants: vs,
      variant_count: vs.length,
      on_hand: vs.reduce((s, v) => s + v.on_hand, 0),
      stock_value: vs.reduce((s, v) => s + v.on_hand * v.avg_cost, 0),
      price_min: prices.length ? Math.min(...prices) : Number(p.default_sale_price),
      price_max: prices.length ? Math.max(...prices) : Number(p.default_sale_price),
      low: vs.some((v) => v.available > 0 && v.available <= v.reorder_point),
      out: vs.length > 0 && vs.every((v) => v.available <= 0),
    };
  });

  return { rows, total: count ?? 0, offset, limit };
}
