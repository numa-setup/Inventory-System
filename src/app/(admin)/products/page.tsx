import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchProductsPage, PRODUCTS_PAGE_SIZE } from "@/lib/products-query";
import { ProductsClient } from "@/features/products/ProductsClient";

export const metadata: Metadata = { title: "Products" };

interface CatRow { id: string; name: string; parent_id: string | null }

export default async function ProductsPage() {
  const supabase = await createClient();

  // First page only (server-side paginated); the client loads more on demand.
  // Categories are a small dimension table loaded once for the filter dropdown.
  const [firstPage, { data: categories }] = await Promise.all([
    fetchProductsPage(supabase, { offset: 0, limit: PRODUCTS_PAGE_SIZE }),
    supabase.from("categories").select("id, name, parent_id").order("name"),
  ]);

  const cats = (categories ?? []) as CatRow[];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const catOptions = cats
    .map((c) => ({
      id: c.id,
      name: c.parent_id ? `${catName.get(c.parent_id) ?? "?"} › ${c.name}` : c.name,
      isParent: !c.parent_id && cats.some((x) => x.parent_id === c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <ProductsClient initialPage={firstPage} categories={catOptions} />;
}
