import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { PosClient, type PosProduct, type StoreSettings } from "@/features/pos/PosClient";

export const metadata: Metadata = { title: "POS Billing" };

export default async function PosPage() {
  const supabase = await createClient();
  // SSR first paint from the single catalogue_index view (1 query instead of the
  // old 5-query JS assembly); the client then takes over with the cached index.
  const [{ data: catalog }, { data: customers }, { data: categories }, { data: settings }, user] = await Promise.all([
    supabase
      .from("catalog_index")
      .select("variant_id, product_id, product_name, has_variants, sku, label, barcode, price, avg_cost, cost, category_id, available")
      .eq("active", true)
      .order("product_name"),
    supabase.from("customers").select("id, name, phone").order("name"),
    supabase.from("categories").select("id, name, parent_id"),
    supabase.from("settings").select("store_name, tax_percent, store_info").eq("id", 1).maybeSingle(),
    getCurrentUser(),
  ]);

  const info = (settings?.store_info ?? {}) as Record<string, string | undefined>;
  const store: StoreSettings = {
    name: settings?.store_name ?? "Hamza General Store",
    address: info.address,
    phone: info.phone,
    ntn: info.ntn,
    logo_url: info.logo_url,
    receipt_header: info.receipt_header,
    receipt_footer: info.receipt_footer,
    tax_percent: Number(settings?.tax_percent ?? 0),
  };

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const items: PosProduct[] = (catalog ?? []).map((v) => ({
    variant_id: v.variant_id,
    product_id: v.product_id,
    name: v.product_name,
    label: v.has_variants ? v.label : "",
    sku: v.sku,
    barcode: v.barcode,
    price: Number(v.price),
    cost: Number(v.avg_cost) || Number(v.cost),
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
      store={store}
      cashierName={user?.fullName ?? "Cashier"}
    />
  );
}
