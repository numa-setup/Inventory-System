import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { StorefrontClient, type ListingRow } from "@/features/storefront/StorefrontClient";

export const metadata: Metadata = { title: "Storefront" };

export default async function StorefrontPage() {
  const supabase = await createClient();
  const [{ data: listings }, { data: products }] = await Promise.all([
    supabase.from("store_listings").select("id, product_id, is_published, online_price, title, slug").order("sort"),
    supabase.from("products").select("id, name, sku, default_sale_price"),
  ]);

  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));
  const rows: ListingRow[] = (listings ?? []).map((l) => {
    const p = prodMap.get(l.product_id);
    return {
      id: l.id,
      product_id: l.product_id,
      name: p?.name ?? l.title ?? "—",
      sku: p?.sku ?? "",
      is_published: l.is_published,
      online_price: l.online_price != null ? Number(l.online_price) : Number(p?.default_sale_price ?? 0),
      slug: l.slug ?? "",
    };
  });

  return <StorefrontClient rows={rows} />;
}
