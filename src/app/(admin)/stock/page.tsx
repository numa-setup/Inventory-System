import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { StockClient, type StockRow } from "@/features/stock/StockClient";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage() {
  const supabase = await createClient();
  const [{ data: products }, { data: availability }] = await Promise.all([
    supabase.from("products").select("id, sku, name, base_unit, reorder_point, safety_stock").order("name"),
    supabase.from("product_availability").select("product_id, on_hand, reserved, available, avg_cost"),
  ]);

  const availMap = new Map((availability ?? []).map((a) => [a.product_id, a]));
  const rows: StockRow[] = (products ?? []).map((p) => {
    const av = availMap.get(p.id);
    const on_hand = av ? Number(av.on_hand) : 0;
    const avg_cost = av ? Number(av.avg_cost) : 0;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      base_unit: p.base_unit,
      reorder_point: Number(p.reorder_point),
      on_hand,
      reserved: av ? Number(av.reserved) : 0,
      available: av ? Number(av.available) : 0,
      avg_cost,
      value: on_hand * avg_cost,
    };
  });

  return <StockClient rows={rows} />;
}
