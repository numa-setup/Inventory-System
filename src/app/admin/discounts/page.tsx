import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscountsClient, type DiscountRow, type PickerProduct, type PickerCategory } from "@/features/discounts/DiscountsClient";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  const supabase = await createClient();

  const [{ data }, { data: usage }, { data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("discounts")
      .select("id, name, type, value, scope, code, min_amount, target_id, buy_qty, get_qty, get_discount_percent, start_at, end_at, active, description")
      .order("created_at", { ascending: false }),
    supabase.from("discount_usage").select("discount_id, times_applied, total_discount, profit_after"),
    supabase.from("products").select("id, name").eq("active", true).order("name"),
    supabase.from("categories").select("id, name, parent_id").order("name"),
  ]);

  const usageMap = new Map((usage ?? []).map((u) => [u.discount_id, u]));

  const rows: DiscountRow[] = (data ?? []).map((d) => {
    const u = usageMap.get(d.id);
    return {
      id: d.id, name: d.name, type: d.type, value: Number(d.value), scope: d.scope,
      code: d.code, min_amount: Number(d.min_amount), target_id: d.target_id,
      buy_qty: Number(d.buy_qty) || 1, get_qty: Number(d.get_qty) || 1,
      get_discount_percent: Number(d.get_discount_percent) || 100,
      start_at: d.start_at, end_at: d.end_at, active: d.active, description: d.description ?? null,
      times_applied: Number(u?.times_applied ?? 0),
      total_discount: Number(u?.total_discount ?? 0),
      profit_after: Number(u?.profit_after ?? 0),
    };
  });

  const pickerProducts: PickerProduct[] = (products ?? []).map((p) => ({ id: p.id, name: p.name }));
  const pickerCategories: PickerCategory[] = (categories ?? []).map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id ?? null }));

  return <DiscountsClient rows={rows} products={pickerProducts} categories={pickerCategories} />;
}
