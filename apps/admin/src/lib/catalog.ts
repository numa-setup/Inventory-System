import type { createClient } from "@hamza/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface VariantOption {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  label: string;
  sku: string;
  barcode: string | null;
  cost: number;
  sale_price: number;
  category_id: string | null;
  has_variants: boolean;
}

/**
 * Flat, searchable list of every active variant with a composed option label
 * (e.g. "Ruby Red / 3.5g"). Shared by Purchasing pickers and POS.
 */
export async function getVariantOptions(supabase: Supabase): Promise<VariantOption[]> {
  const [{ data: variants }, { data: products }, { data: barcodes }, { data: optionValues }, { data: vov }] =
    await Promise.all([
      supabase.from("product_variants").select("id, product_id, sku, cost, sale_price, is_default, active").eq("active", true),
      supabase.from("products").select("id, name, brand, category_id, has_variants, active"),
      supabase.from("product_barcodes").select("variant_id, barcode, is_primary"),
      supabase.from("product_option_values").select("id, value"),
      supabase.from("variant_option_values").select("variant_id, option_value_id"),
    ]);

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const barcodeMap = new Map<string, string>();
  for (const b of barcodes ?? []) if (!barcodeMap.has(b.variant_id) || b.is_primary) barcodeMap.set(b.variant_id, b.barcode);
  const valLabel = new Map((optionValues ?? []).map((v) => [v.id, v.value]));
  const labels = new Map<string, string[]>();
  for (const link of vov ?? []) {
    const val = valLabel.get(link.option_value_id);
    if (!val) continue;
    const arr = labels.get(link.variant_id) ?? [];
    arr.push(val);
    labels.set(link.variant_id, arr);
  }

  return (variants ?? [])
    .map((v) => {
      const p = productMap.get(v.product_id);
      if (!p || p.active === false) return null;
      return {
        variant_id: v.id,
        product_id: v.product_id,
        product_name: p.name as string,
        brand: (p.brand as string) ?? null,
        label: (labels.get(v.id) ?? []).join(" / ") || (v.is_default ? "Default" : v.sku),
        sku: v.sku,
        barcode: barcodeMap.get(v.id) ?? null,
        cost: Number(v.cost),
        sale_price: Number(v.sale_price),
        category_id: (p.category_id as string) ?? null,
        has_variants: Boolean(p.has_variants),
      } as VariantOption;
    })
    .filter((x): x is VariantOption => x !== null)
    .sort((a, b) => a.product_name.localeCompare(b.product_name) || a.label.localeCompare(b.label));
}
