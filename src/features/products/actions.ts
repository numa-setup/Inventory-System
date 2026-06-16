"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

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
