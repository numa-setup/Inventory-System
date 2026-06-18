"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchProductsPage, type ProductsQuery, type ProductsPage } from "@/lib/products-query";
import { generateInternalEan13, generateWeightTemplateEan13 } from "@/lib/barcode";
import { productInputSchema, variantPatchSchema, importRowsSchema, firstIssue } from "@/lib/validation";

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

async function requireOwner() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return null;
  return user;
}

/** Archive (deactivate) or restore a product — the everyday soft-delete path. */
export async function setProductActive(productId: string, active: boolean) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("products").update({ active }).eq("id", productId);
  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true as const };
}

/**
 * Permanently delete a product — owner only, and only when it has NO transaction
 * history (so historical reports stay correct). Requires the typed name to match.
 * Child rows (variants, barcodes, options, listing) cascade automatically.
 */
export async function permanentlyDeleteProduct(productId: string, confirmName: string) {
  if (!(await requireOwner())) return { error: "Only the owner can permanently delete products." };
  const db = createAdminClient();

  const { data: product } = await db.from("products").select("id, name").eq("id", productId).maybeSingle();
  if (!product) return { error: "Product not found." };
  if (confirmName.trim() !== (product.name as string).trim()) {
    return { error: "The name you typed doesn’t match — nothing was deleted." };
  }

  // Block if the product appears in any ledger / sale / order / reservation / PO.
  const head = { count: "exact" as const, head: true };
  const checks = await Promise.all([
    db.from("stock_moves").select("id", head).eq("product_id", productId),
    db.from("sale_items").select("id", head).eq("product_id", productId),
    db.from("order_items").select("id", head).eq("product_id", productId),
    db.from("reservations").select("id", head).eq("product_id", productId),
    db.from("purchase_order_items").select("id", head).eq("product_id", productId),
    db.from("goods_receipt_items").select("id", head).eq("product_id", productId),
  ]);
  const historyCount = checks.reduce((s, c) => s + (c.count ?? 0), 0);
  if (historyCount > 0) {
    return { error: "This product has transaction history, so it can’t be permanently deleted. Archive it instead to keep your reports accurate.", hasHistory: true as const };
  }

  // Defensive: clear any (orphan) stock_levels rows, which don't cascade.
  const { data: variants } = await db.from("product_variants").select("id").eq("product_id", productId);
  const variantIds = (variants ?? []).map((v) => v.id);
  if (variantIds.length) await db.from("stock_levels").delete().in("variant_id", variantIds);
  await db.from("stock_levels").delete().eq("product_id", productId);

  const { error } = await db.from("products").delete().eq("id", productId);
  if (error) return { error: error.message };

  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true as const };
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
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const db = createAdminClient();

  // One transactional round-trip: product + listing + options/values + variants +
  // barcodes + option links + opening stock (was up to ~35 sequential calls).
  const payload = {
    ...input,
    slug: `${slugify(input.name)}-${slugify(input.variants[0].sku)}`,
    created_by: user.id,
  };
  const { data, error } = await db.rpc("create_product_full", { payload });
  if (error) {
    const msg = error.message.includes("duplicate key")
      ? error.message.includes("barcode") ? "That barcode is already used by another product."
        : "That SKU is already used by another product."
      : error.message;
    return { error: msg };
  }

  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true, id: data as string };
}

/** Update the parent product's descriptive fields. */
export async function updateProduct(
  id: string,
  input: { name?: string; brand?: string | null; category_id?: string | null; description?: string | null; base_unit?: string; active?: boolean },
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
      ...(input.base_unit ? { base_unit: input.base_unit } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/products");
  revalidatePath("/stock");
  return { ok: true };
}

/** Update a single variant's SKU / barcode / pricing / reorder / active flag. */
export async function updateVariant(
  id: string,
  input: { sku?: string; barcode?: string | null; sale_price?: number; cost?: number; reorder_point?: number; active?: boolean },
) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const { sku, barcode, ...rest } = input;
  const v = variantPatchSchema.safeParse(rest);
  if (!v.success) return { error: firstIssue(v.error) };
  const db = createAdminClient();

  const patch: Record<string, unknown> = { ...rest };
  if (sku !== undefined && sku.trim()) patch.sku = sku.trim();
  const { error } = await db.from("product_variants").update(patch).eq("id", id);
  if (error) {
    return { error: error.message.includes("duplicate") ? "That SKU is already used by another variant." : error.message };
  }

  // Barcode: update the variant's primary barcode (insert if it has none).
  if (barcode !== undefined) {
    const code = (barcode ?? "").trim();
    const { data: variant } = await db.from("product_variants").select("product_id").eq("id", id).maybeSingle();
    const { data: existing } = await db.from("product_barcodes").select("id").eq("variant_id", id).eq("is_primary", true).maybeSingle();
    if (code) {
      if (existing) {
        const { error: bErr } = await db.from("product_barcodes").update({ barcode: code }).eq("id", existing.id);
        if (bErr) return { error: bErr.message.includes("duplicate") ? "That barcode is already used elsewhere." : bErr.message };
      } else if (variant) {
        const { error: bErr } = await db.from("product_barcodes").insert({ product_id: variant.product_id, variant_id: id, barcode: code, type: "EAN", is_primary: true });
        if (bErr) return { error: bErr.message.includes("duplicate") ? "That barcode is already used elsewhere." : bErr.message };
      }
    } else if (existing) {
      await db.from("product_barcodes").delete().eq("id", existing.id);
    }
  }

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
  const v = importRowsSchema.safeParse(rows);
  if (!v.success) return { error: firstIssue(v.error) };
  return validateRows(createAdminClient(), rows);
}

/** Import only the rows that pass validation; posts opening stock for qty > 0. */
export async function importProducts(rows: ImportRow[]) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const v = importRowsSchema.safeParse(rows);
  if (!v.success) return { error: firstIssue(v.error) };
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

// ---- Product image gallery -----------------------------------------------
// store_listings.images[] is the gallery; products.image_url mirrors the first
// (cover) image so cards / catalog_index / POS use it without joining listings.
const IMAGE_BUCKET = "product-images";

async function uploadOne(db: ReturnType<typeof createAdminClient>, productId: string, file: File): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0 || file.size > 5_242_880 || !file.type.startsWith("image/")) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
  if (error) return null;
  return db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function currentImages(db: ReturnType<typeof createAdminClient>, productId: string): Promise<string[]> {
  const { data } = await db.from("store_listings").select("images").eq("product_id", productId).maybeSingle();
  const imgs = ((data?.images as string[]) ?? []).filter(Boolean);
  if (imgs.length) return imgs;
  // migrate a legacy single image_url into the gallery view
  const { data: p } = await db.from("products").select("image_url").eq("id", productId).maybeSingle();
  return p?.image_url ? [p.image_url as string] : [];
}

async function syncGallery(db: ReturnType<typeof createAdminClient>, productId: string, images: string[]) {
  await db.from("store_listings").upsert({ product_id: productId, images }, { onConflict: "product_id" });
  await db.from("products").update({ image_url: images[0] ?? null }).eq("id", productId);
}

/** Current gallery images for a product (cover first). */
export async function getProductImages(productId: string): Promise<string[]> {
  if (!(await requireManager())) return [];
  return currentImages(createAdminClient(), productId);
}

/** Upload one or more photos; appends to the gallery and keeps the cover synced. */
export async function uploadProductImages(productId: string, formData: FormData) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "No images selected." };
  if (files.some((f) => f.size > 5_242_880)) return { error: "Each image must be under 5 MB." };

  const db = createAdminClient();
  const urls: string[] = [];
  for (const f of files.slice(0, 8)) { const u = await uploadOne(db, productId, f); if (u) urls.push(u); }
  if (!urls.length) return { error: "Upload failed — please try again." };

  const images = [...(await currentImages(db, productId)), ...urls];
  await syncGallery(db, productId, images);
  revalidatePath("/products");
  return { ok: true as const, images };
}

/** Remove a photo from the gallery (and storage). */
export async function removeProductImageUrl(productId: string, url: string) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const images = (await currentImages(db, productId)).filter((u) => u !== url);
  await syncGallery(db, productId, images);
  const path = url.split(`/${IMAGE_BUCKET}/`)[1];
  if (path) await db.storage.from(IMAGE_BUCKET).remove([path]);
  revalidatePath("/products");
  return { ok: true as const, images };
}

/** Make a photo the cover (move to front of the gallery). */
export async function setPrimaryProductImage(productId: string, url: string) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const cur = await currentImages(db, productId);
  if (!cur.includes(url)) return { error: "Image not found." };
  const images = [url, ...cur.filter((u) => u !== url)];
  await syncGallery(db, productId, images);
  revalidatePath("/products");
  return { ok: true as const, images };
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
