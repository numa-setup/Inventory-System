import type { Metadata } from "next";
import { createClient } from "@hamza/shared/supabase/server";
import { getCurrentUser } from "@hamza/shared/auth";
import { fetchProductsPage, PRODUCTS_PAGE_SIZE } from "@/lib/products-query";
import { ProductsClient } from "@/features/products/ProductsClient";

export const metadata: Metadata = { title: "Products" };

interface CatRow { id: string; name: string; parent_id: string | null }

export default async function ProductsPage() {
  const supabase = await createClient();

  // First page only (server-side paginated); the client loads more on demand.
  // Categories are a small dimension table loaded once for the filter dropdown.
  const [firstPage, { data: categories }, { data: settings }, user] = await Promise.all([
    fetchProductsPage(supabase, { offset: 0, limit: PRODUCTS_PAGE_SIZE }),
    supabase.from("categories").select("id, name, parent_id").order("name"),
    supabase.from("settings").select("store_info").eq("id", 1).maybeSingle(),
    getCurrentUser(),
  ]);

  const inv = ((settings?.store_info as Record<string, unknown> | null)?.inventory ?? {}) as { low_stock_default?: number };
  const lowStockDefault = Number(inv.low_stock_default) > 0 ? Number(inv.low_stock_default) : 3;

  const cats = (categories ?? []) as CatRow[];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const catOptions = cats
    .map((c) => ({
      id: c.id,
      name: c.parent_id ? `${catName.get(c.parent_id) ?? "?"} › ${c.name}` : c.name,
      isParent: !c.parent_id && cats.some((x) => x.parent_id === c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const catTree = cats.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id }));

  return <ProductsClient initialPage={firstPage} categories={catOptions} catTree={catTree} isOwner={user?.role === "owner"} lowStockDefault={lowStockDefault} />;
}
