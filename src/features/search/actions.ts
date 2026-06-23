"use server";

import { createAdminClient } from "@hamza/shared/supabase/admin";
import { getCurrentUser } from "@hamza/shared/auth";

export interface SearchResults {
  products: { variant_id: string; name: string; label: string; sku: string; price: number; available: number }[];
  invoices: { id: string; receipt_no: string; total: number; created_at: string }[];
  categories: { id: string; name: string }[];
}

const empty: SearchResults = { products: [], invoices: [], categories: [] };

/** Global instant search across products/SKU/barcode, invoices, and categories. */
export async function globalSearch(q: string): Promise<SearchResults> {
  const user = await getCurrentUser();
  if (!user) return empty;
  const term = q.trim();
  if (term.length < 2) return empty;
  const s = term.replace(/[(),%*]/g, " ").trim();
  if (!s) return empty;

  const db = createAdminClient();
  const [{ data: products }, { data: sales }, { data: cats }] = await Promise.all([
    db.from("catalog_index")
      .select("variant_id, product_name, label, sku, price, available")
      .or(`product_name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`)
      .eq("active", true)
      .limit(6),
    db.from("sales").select("id, receipt_no, total, created_at").ilike("receipt_no", `%${s}%`).order("created_at", { ascending: false }).limit(5),
    db.from("categories").select("id, name").ilike("name", `%${s}%`).limit(5),
  ]);

  return {
    products: (products ?? []).map((p) => ({
      variant_id: p.variant_id, name: p.product_name, label: p.label, sku: p.sku,
      price: Number(p.price), available: Number(p.available),
    })),
    invoices: (sales ?? []).map((x) => ({ id: x.id, receipt_no: x.receipt_no, total: Number(x.total), created_at: x.created_at })),
    categories: cats ?? [],
  };
}
