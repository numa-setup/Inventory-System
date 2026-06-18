import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoriesClient, type CategoryNode } from "@/features/categories/CategoriesClient";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const supabase = await createClient();
  const [{ data: cats }, { data: prods }] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id, sort").order("sort").order("name"),
    supabase.from("products").select("category_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of (prods ?? []) as { category_id: string | null }[]) {
    if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  const nodes: CategoryNode[] = ((cats ?? []) as { id: string; name: string; parent_id: string | null }[])
    .map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id, product_count: counts.get(c.id) ?? 0 }));

  return <CategoriesClient categories={nodes} />;
}
