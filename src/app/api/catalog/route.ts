import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The lightweight catalogue index: one row per sellable variant with name,
// option label, primary barcode, price, cost and live stock. The client caches
// this (in-memory + IndexedDB) so scans and search resolve instantly and keep
// working through brief network drops — see src/lib/catalog-cache.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("catalog_index")
    .select(
      "variant_id, product_id, product_name, brand, has_variants, is_variable_weight, sku, label, barcode, price, cost, category_id, image_url, available, avg_cost, active, updated_at",
    )
    .eq("active", true)
    .order("product_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { items: data ?? [], fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
