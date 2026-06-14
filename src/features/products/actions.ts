"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export interface ProductInput {
  name: string;
  sku: string;
  category_id?: string | null;
  base_unit: string;
  default_sale_price: number;
  reorder_point: number;
  barcode?: string | null;
  opening_qty?: number | null;
  opening_cost?: number | null;
}

export async function createProduct(input: ProductInput) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) {
    return { error: "Not authorized." };
  }
  const db = createAdminClient();

  const { data: product, error } = await db
    .from("products")
    .insert({
      name: input.name,
      sku: input.sku,
      category_id: input.category_id || null,
      base_unit: input.base_unit || "pcs",
      default_sale_price: input.default_sale_price,
      reorder_point: input.reorder_point,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  const productId = product.id as string;

  if (input.barcode) {
    await db.from("product_barcodes").insert({
      product_id: productId,
      barcode: input.barcode,
      type: "EAN",
      is_primary: true,
    });
  }

  // Auto-create the hidden storefront listing
  await db.from("store_listings").insert({
    product_id: productId,
    online_price: input.default_sale_price,
    title: input.name,
    slug: `${slugify(input.name)}-${input.sku.toLowerCase()}`,
  });

  // Optional opening stock via the ledger (SUPPLIER -> MAIN)
  if (input.opening_qty && input.opening_qty > 0) {
    const { data: locs } = await db
      .from("locations")
      .select("id, code")
      .in("code", ["SUP", "MAIN"]);
    const sup = locs?.find((l) => l.code === "SUP")?.id;
    const main = locs?.find((l) => l.code === "MAIN")?.id;
    if (sup && main) {
      await db.from("stock_moves").insert({
        product_id: productId,
        qty: input.opening_qty,
        from_location_id: sup,
        to_location_id: main,
        unit_cost: input.opening_cost ?? 0,
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

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) {
    return { error: "Not authorized." };
  }
  const db = createAdminClient();
  const { error } = await db
    .from("products")
    .update({
      name: input.name,
      category_id: input.category_id || null,
      base_unit: input.base_unit,
      default_sale_price: input.default_sale_price,
      reorder_point: input.reorder_point,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/products");
  return { ok: true };
}
