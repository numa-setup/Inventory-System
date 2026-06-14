import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PurchasingClient } from "@/features/purchasing/PurchasingClient";

export const metadata: Metadata = { title: "Purchasing" };

export default async function PurchasingPage() {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: products }, { data: receipts }] = await Promise.all([
    supabase.from("suppliers").select("id, name, phone, address").order("name"),
    supabase.from("products").select("id, sku, name, base_unit").eq("active", true).order("name"),
    supabase.from("goods_receipts").select("id, grn_no, created_at, supplier_id").order("created_at", { ascending: false }).limit(20),
  ]);

  const supMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  return (
    <PurchasingClient
      suppliers={(suppliers ?? []).map((s) => ({ id: s.id, name: s.name, phone: s.phone, address: s.address }))}
      products={(products ?? []).map((p) => ({ id: p.id, sku: p.sku, name: p.name, base_unit: p.base_unit }))}
      receipts={(receipts ?? []).map((r) => ({ id: r.id, grn_no: r.grn_no, created_at: r.created_at, supplier: r.supplier_id ? (supMap.get(r.supplier_id) ?? "—") : "—" }))}
    />
  );
}
