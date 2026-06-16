import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getVariantOptions } from "@/lib/catalog";
import { PosClient, type PosProduct } from "@/features/pos/PosClient";

export const metadata: Metadata = { title: "POS Billing" };

export default async function PosPage() {
  const supabase = await createClient();
  const [variants, { data: availability }, { data: customers }, { data: categories }] = await Promise.all([
    getVariantOptions(supabase),
    supabase.from("variant_availability").select("variant_id, available"),
    supabase.from("customers").select("id, name, phone").order("name"),
    supabase.from("categories").select("id, name, parent_id"),
  ]);

  const availMap = new Map((availability ?? []).map((a) => [a.variant_id, Number(a.available)]));
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const items: PosProduct[] = variants.map((v) => ({
    variant_id: v.variant_id,
    product_id: v.product_id,
    name: v.product_name,
    label: v.has_variants ? v.label : "",
    sku: v.sku,
    barcode: v.barcode,
    price: v.sale_price,
    available: availMap.get(v.variant_id) ?? 0,
    category_id: v.category_id,
  }));

  // top-level categories present in the catalogue, for the filter chips
  const usedCats = new Set(items.map((i) => i.category_id).filter(Boolean) as string[]);
  const cats = (categories ?? [])
    .filter((c) => usedCats.has(c.id))
    .map((c) => ({ id: c.id, name: c.parent_id ? `${catName.get(c.parent_id) ?? ""} › ${c.name}` : c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const barcodeIndex: Record<string, string> = {};
  for (const v of variants) if (v.barcode) barcodeIndex[v.barcode] = v.variant_id;

  return (
    <PosClient
      products={items}
      categories={cats}
      barcodeIndex={barcodeIndex}
      customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
    />
  );
}
