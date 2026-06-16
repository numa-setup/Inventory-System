import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ProductsClient, type ProductRow, type VariantRow } from "@/features/products/ProductsClient";

export const metadata: Metadata = { title: "Products" };

interface CatRow { id: string; name: string; parent_id: string | null }

export default async function ProductsPage() {
  const supabase = await createClient();

  const [
    { data: products }, { data: categories }, { data: variants },
    { data: availability }, { data: barcodes },
    { data: options }, { data: optionValues }, { data: vov },
  ] = await Promise.all([
    supabase.from("products").select("id, sku, name, brand, category_id, base_unit, default_sale_price, has_variants, active, image_url").order("name"),
    supabase.from("categories").select("id, name, parent_id").order("name"),
    supabase.from("product_variants").select("id, product_id, sku, cost, sale_price, reorder_point, is_default, active").order("is_default", { ascending: false }),
    supabase.from("variant_availability").select("variant_id, on_hand, reserved, available, avg_cost"),
    supabase.from("product_barcodes").select("variant_id, barcode, is_primary"),
    supabase.from("product_options").select("id, product_id, name, sort").order("sort"),
    supabase.from("product_option_values").select("id, option_id, value, sort"),
    supabase.from("variant_option_values").select("variant_id, option_value_id"),
  ]);

  const cats = (categories ?? []) as CatRow[];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const availMap = new Map((availability ?? []).map((a) => [a.variant_id, a]));
  const barcodeMap = new Map<string, string>();
  for (const b of barcodes ?? []) {
    if (!barcodeMap.has(b.variant_id) || b.is_primary) barcodeMap.set(b.variant_id, b.barcode);
  }

  // option-value id -> label, and which option it belongs to (for ordering)
  const optName = new Map((options ?? []).map((o) => [o.id, o.name]));
  const valLabel = new Map((optionValues ?? []).map((v) => [v.id, { value: v.value, optionId: v.option_id }]));
  const variantLabels = new Map<string, string[]>();
  for (const link of vov ?? []) {
    const v = valLabel.get(link.option_value_id);
    if (!v) continue;
    const arr = variantLabels.get(link.variant_id) ?? [];
    arr.push(v.value);
    variantLabels.set(link.variant_id, arr);
  }

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
      category: p.category_id ? (catName.get(p.category_id) ?? "—") : "—",
      base_unit: p.base_unit,
      has_variants: p.has_variants,
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

  // categories for the picker: leaf-aware "Parent › Child" labels
  const parentOf = new Map(cats.map((c) => [c.id, c.parent_id]));
  const catOptions = cats
    .map((c) => ({
      id: c.id,
      name: c.parent_id ? `${catName.get(c.parent_id) ?? "?"} › ${c.name}` : c.name,
      isParent: !c.parent_id && cats.some((x) => x.parent_id === c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  void parentOf;
  return <ProductsClient rows={rows} categories={catOptions} />;
}
