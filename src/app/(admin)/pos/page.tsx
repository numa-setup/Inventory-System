import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PosClient, type PosProduct } from "@/features/pos/PosClient";

export const metadata: Metadata = { title: "POS Billing" };

export default async function PosPage() {
  const supabase = await createClient();
  // SSR first paint from the single catalogue_index view (1 query instead of the
  // old 5-query JS assembly); the client then takes over with the cached index.
  const [{ data: catalog }, { data: customers }, { data: categories }] = await Promise.all([
    supabase
      .from("catalog_index")
      .select("variant_id, product_id, product_name, has_variants, sku, label, barcode, price, category_id, available")
      .eq("active", true)
      .order("product_name"),
    supabase.from("customers").select("id, name, phone").order("name"),
    supabase.from("categories").select("id, name, parent_id"),
  ]);

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const items: PosProduct[] = (catalog ?? []).map((v) => ({
    variant_id: v.variant_id,
    product_id: v.product_id,
    name: v.product_name,
    label: v.has_variants ? v.label : "",
    sku: v.sku,
    barcode: v.barcode,
    price: Number(v.price),
    available: Number(v.available),
    category_id: v.category_id,
  }));

  // top-level categories present in the catalogue, for the filter chips
  const usedCats = new Set(items.map((i) => i.category_id).filter(Boolean) as string[]);
  const cats = (categories ?? [])
    .filter((c) => usedCats.has(c.id))
    .map((c) => ({ id: c.id, name: c.parent_id ? `${catName.get(c.parent_id) ?? ""} › ${c.name}` : c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const barcodeIndex: Record<string, string> = {};
  for (const v of items) if (v.barcode) barcodeIndex[v.barcode] = v.variant_id;

  return (
    <PosClient
      products={items}
      categories={cats}
      barcodeIndex={barcodeIndex}
      customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
    />
  );
}
