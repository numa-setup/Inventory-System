import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ProductsClient, type ProductRow } from "@/features/products/ProductsClient";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: categories }, { data: availability }, { data: barcodes }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, category_id, base_unit, default_sale_price, reorder_point, active, image_url")
        .order("name"),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("product_availability").select("product_id, on_hand, available, avg_cost"),
      supabase.from("product_barcodes").select("product_id, barcode").eq("is_primary", true),
    ]);

  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const availMap = new Map((availability ?? []).map((a) => [a.product_id, a]));
  const barcodeMap = new Map((barcodes ?? []).map((b) => [b.product_id, b.barcode]));

  const rows: ProductRow[] = (products ?? []).map((p) => {
    const av = availMap.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category_id: p.category_id,
      category: p.category_id ? (catMap.get(p.category_id) ?? "—") : "—",
      base_unit: p.base_unit,
      price: Number(p.default_sale_price),
      reorder_point: Number(p.reorder_point),
      on_hand: av ? Number(av.on_hand) : 0,
      available: av ? Number(av.available) : 0,
      avg_cost: av ? Number(av.avg_cost) : 0,
      barcode: barcodeMap.get(p.id) ?? null,
      active: p.active,
    };
  });

  return (
    <ProductsClient
      rows={rows}
      categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
