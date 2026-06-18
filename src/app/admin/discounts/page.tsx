import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DiscountsClient, type DiscountRow } from "@/features/discounts/DiscountsClient";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("discounts")
    .select("id, name, type, value, scope, code, min_amount, active, start_at, end_at")
    .order("created_at", { ascending: false });

  const rows: DiscountRow[] = (data ?? []).map((d) => ({
    id: d.id, name: d.name, type: d.type, value: Number(d.value), scope: d.scope,
    code: d.code, min_amount: Number(d.min_amount), active: d.active,
    start_at: d.start_at, end_at: d.end_at,
  }));

  return <DiscountsClient rows={rows} />;
}
