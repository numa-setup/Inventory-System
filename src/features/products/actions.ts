"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchProductsPage, type ProductsQuery, type ProductsPage } from "@/lib/products-query";
import { generateInternalEan13, generateWeightTemplateEan13 } from "@/lib/barcode";

/**
 * Server-side paginated + filtered product search. Powers the Products list's
 * debounced search and "load more" — only one page (+ its related rows) crosses
 * the wire, never the whole table.
 */
export async function searchProducts(params: ProductsQuery): Promise<ProductsPage> {
  const supabase = await createClient();
  return fetchProductsPage(supabase, params);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return null;
  return user;
}

export interface VariantInput {
  sku: string;
  barcode?: string | null;
  sale_price: number;
  cost: number;
  reorder_point: number;
  opening_qty?: number | null;
  /** Selected option values, one per option in declared order (e.g. ["Ruby Red","3.5g"]). */
  option_values: string[];
}

export interface ProductInput {
  name: string;
  brand?: string | null;
  category_id?: string | null;
  description?: string | null;
  base_unit?: string;
  base_price: number;
  has_variants: boolean;
  /** Ordered option definitions; empty when the product has no variants. */
  options: { name: string; values: string[] }[];
  variants: VariantInput[];
}

/**
 * Create a product as a parent grouping plus one or more variants.
 * Stock is posted per-variant through the append-only ledger.
 */
export async function createProduct(input: ProductInput) {
  const user = await requireManager();
  if (!user) return { error: "Not authorized." };
  const db = createAdminClient();

  if (!input.variants?.length) return { error: "At least one variant is required." };

  // 1. Parent product
  const { data: product, error } = await db
    .from("products")
    .insert({
      name: input.name,
      sku: input.variants[0].sku, // parent keeps the first/default variant's sku for back-compat
      brand: input.brand || null,
      category_id: input.category_id || null,
      description: input.description || null,
      base_unit: input.base_unit || "pcs",
      default_sale_price: input.base_price,
      reorder_point: input.variants[0].reorder_point ?? 0,
      has_variants: input.has_variants,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const productId = product.id as string;

  // 2. Hidden storefront listing (parent level)
  await db.from("store_listings").insert({
    product_id: productId,
    online_price: input.base_price,
    title: input.name,
    slug: `${slugify(input.name)}-${slugify(input.variants[0].sku)}`,
  });

  // 3. Options + values -> value label maps to ids
  const valueId = new Map<string, string>(); // key: `${optIndex}::${value}`
  for (let oi = 0; oi < input.options.length; oi++) {
    const opt = input.options[oi];
    const { data: optRow, error: oErr } = await db
      .from("product_options")
      .insert({ product_id: productId, name: opt.name, sort: oi + 1 })
      .select("id")
      .single();
    if (oErr) return { error: oErr.message };
    for (let vi = 0; vi < opt.values.length; vi++) {
      const { data: valRow, error: vErr } = await db
        .from("product_option_values")
        .insert({ option_id: optRow.id, value: opt.values[vi], sort: vi + 1 })
        .select("id")
        .single();
      if (vErr) return { error: vErr.message };
      valueId.set(`${oi}::${opt.values[vi]}`, valRow.id as string);
    }
  }

  // 4. Locations for opening stock
  const { data: locs } = await db
    .from("locations")
    .select("id, code")
    .in("code", ["SUP", "MAIN"]);
  const sup = locs?.find((l) => l.code === "SUP")?.id;
  const main = locs?.find((l) => l.code === "MAIN")?.id;

  // 5. Variants + barcodes + option links + opening stock
  for (let i = 0; i < input.variants.length; i++) {
    const v = input.variants[i];
    const { data: variant, error: varErr } = await db
      .from("product_variants")
      .insert({
        product_id: productId,
        sku: v.sku,
        cost: v.cost || 0,
        sale_price: v.sale_price || 0,
        reorder_point: v.reorder_point || 0,
        is_default: i === 0,
      })
      .select("id")
      .single();
    if (varErr) return { error: varErr.message };
    const variantId = variant.id as string;

    if (v.barcode) {
      await db.from("product_barcodes").insert({
        product_id: productId,
        variant_id: variantId,
        barcode: v.barcode,
        type: input.has_variants ? "INTERNAL" : "EAN",
        is_primary: true,
      });
    }

    // link option values
    const links = v.option_values
      .map((val, oi) => valueId.get(`${oi}::${val}`))
      .filter((id): id is string => Boolean(id))
      .map((option_value_id) => ({ variant_id: variantId, option_value_id }));
    if (links.length) await db.from("variant_option_values").insert(links);

    // opening stock
    if (v.opening_qty && v.opening_qty > 0 && sup && main) {
      await db.from("stock_moves").insert({
        product_id: productId,
        variant_id: variantId,
        qty: v.opening_qty,
        from_location_id: sup,
        to_location_id: main,
        unit_cost: v.cost ?? 0,
        reference_type: "OPENING",
        source: "MANUAL",
        created_by: user.id,
        note: "Opening stock on product creation",
      });
    }
  }

  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true, id: productId };
}

/** Update the parent product's descriptive fields. */
export async function updateProduct(
  id: string,
  input: { name?: string; brand?: string | null; category_id?: string | null; description?: string | null; active?: boolean },
) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db
    .from("products")
    .update({
      name: input.name,
      brand: input.brand ?? null,
      category_id: input.category_id || null,
      description: input.description ?? null,
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/products");
  return { ok: true };
}

/** Update a single variant's pricing / reorder / active flag. */
export async function updateVariant(
  id: string,
  input: { sale_price?: number; cost?: number; reorder_point?: number; active?: boolean },
) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("product_variants").update(input).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/products");
  return { ok: true };
}

// ---- Bulk CSV import (products + opening stock) --------------------------
export interface ImportRow {
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  cost: number;
  qty: number;
}
export interface ValidatedRow extends ImportRow {
  line: number;
  status: "ok" | "error";
  errors: string[];
}

type Db = ReturnType<typeof createAdminClient>;

/** Validate rows against the DB and within the file (duplicate SKU/barcode, required fields). */
async function validateRows(db: Db, rows: ImportRow[]): Promise<ValidatedRow[]> {
  const skus = rows.map((r) => r.sku?.trim()).filter(Boolean);
  const barcodes = rows.map((r) => r.barcode?.trim()).filter(Boolean) as string[];

  const [{ data: pSku }, { data: vSku }, { data: bc }] = await Promise.all([
    skus.length ? db.from("products").select("sku").in("sku", skus) : Promise.resolve({ data: [] as { sku: string }[] }),
    skus.length ? db.from("product_variants").select("sku").in("sku", skus) : Promise.resolve({ data: [] as { sku: string }[] }),
    barcodes.length ? db.from("product_barcodes").select("barcode").in("barcode", barcodes) : Promise.resolve({ data: [] as { barcode: string }[] }),
  ]);
  const existingSku = new Set([...(pSku ?? []), ...(vSku ?? [])].map((r) => r.sku));
  const existingBarcode = new Set((bc ?? []).map((r) => r.barcode));

  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  return rows.map((r, i) => {
    const errors: string[] = [];
    const sku = (r.sku ?? "").trim();
    const barcode = (r.barcode ?? "").trim();
    if (!r.name?.trim()) errors.push("Name required");
    if (!sku) errors.push("SKU required");
    else if (existingSku.has(sku)) errors.push("SKU already exists");
    else if (seenSku.has(sku)) errors.push("Duplicate SKU in file");
    if (barcode) {
      if (existingBarcode.has(barcode)) errors.push("Barcode already exists");
      else if (seenBarcode.has(barcode)) errors.push("Duplicate barcode in file");
    }
    if (!Number.isFinite(r.price) || r.price < 0) errors.push("Invalid price");
    if (!Number.isFinite(r.cost) || r.cost < 0) errors.push("Invalid cost");
    if (!Number.isFinite(r.qty) || r.qty < 0) errors.push("Invalid qty");
    if (sku) seenSku.add(sku);
    if (barcode) seenBarcode.add(barcode);
    return { ...r, sku, barcode, line: i + 1, status: errors.length ? "error" : "ok", errors };
  });
}

/** Dry-run: validate the parsed CSV rows without writing anything. */
export async function validateProductImport(rows: ImportRow[]): Promise<ValidatedRow[] | { error: string }> {
  if (!(await requireManager())) return { error: "Not authorized." };
  return validateRows(createAdminClient(), rows);
}

/** Import only the rows that pass validation; posts opening stock for qty > 0. */
export async function importProducts(rows: ImportRow[]) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const validated = await validateRows(db, rows);
  const valid = validated.filter((r) => r.status === "ok");

  const { data: locs } = await db.from("locations").select("id, code").in("code", ["SUP", "MAIN"]);
  const sup = locs?.find((l) => l.code === "SUP")?.id;
  const main = locs?.find((l) => l.code === "MAIN")?.id;

  let created = 0;
  for (const r of valid) {
    const { data: product, error } = await db
      .from("products")
      .insert({ name: r.name.trim(), sku: r.sku, default_sale_price: r.price || 0, has_variants: false })
      .select("id").single();
    if (error || !product) continue;
    const { data: variant } = await db
      .from("product_variants")
      .insert({ product_id: product.id, sku: r.sku, cost: r.cost || 0, sale_price: r.price || 0, is_default: true })
      .select("id").single();
    if (!variant) continue;
    if (r.barcode) {
      await db.from("product_barcodes").insert({
        product_id: product.id, variant_id: variant.id, barcode: r.barcode,
        type: /^\d{13}$/.test(r.barcode) ? "EAN" : "INTERNAL", is_primary: true,
      });
    }
    if (r.qty > 0 && sup && main) {
      await db.from("stock_moves").insert({
        product_id: product.id, variant_id: variant.id, qty: r.qty, from_location_id: sup, to_location_id: main,
        unit_cost: r.cost || 0, reference_type: "OPENING", source: "IMPORT", note: "CSV import",
      });
    }
    created++;
  }
  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true as const, created, skipped: validated.length - valid.length };
}

/**
 * Ensure a variant has a scannable barcode. If it already has one, return it;
 * otherwise generate an internal GS1 prefix-2 EAN-13 (or a weight template for
 * variable-weight items), save it, and return it. Used by the label printer.
 */
export async function assignInternalBarcode(variantId: string, productId: string, variableWeight = false) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();

  const { data: existing } = await db
    .from("product_barcodes")
    .select("barcode, is_primary")
    .eq("variant_id", variantId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.barcode) return { ok: true, barcode: existing.barcode as string, existed: true };

  const { data: seq, error: seqErr } = await db.rpc("next_internal_barcode");
  if (seqErr) return { error: seqErr.message };
  const n = Number(seq);
  const barcode = variableWeight ? generateWeightTemplateEan13(n) : generateInternalEan13(n);

  const { error } = await db.from("product_barcodes").insert({
    product_id: productId,
    variant_id: variantId,
    barcode,
    type: "INTERNAL",
    is_primary: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/products");
  return { ok: true, barcode, existed: false };
}

/** Bulk set the sale price on every variant of a product. */
export async function bulkSetPrice(productId: string, salePrice: number) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db
    .from("product_variants")
    .update({ sale_price: salePrice })
    .eq("product_id", productId);
  if (error) return { error: error.message };
  revalidatePath("/products");
  return { ok: true };
}
