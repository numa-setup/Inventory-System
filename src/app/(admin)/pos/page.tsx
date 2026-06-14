import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PosClient, type PosProduct } from "@/features/pos/PosClient";

export const metadata: Metadata = { title: "POS Billing" };

export default async function PosPage() {
  const supabase = await createClient();
  const [{ data: products }, { data: availability }, { data: barcodes }, { data: customers }] =
    await Promise.all([
      supabase.from("products").select("id, sku, name, base_unit, default_sale_price").eq("active", true).order("name"),
      supabase.from("product_availability").select("product_id, available"),
      supabase.from("product_barcodes").select("product_id, barcode"),
      supabase.from("customers").select("id, name, phone").order("name"),
    ]);

  const availMap = new Map((availability ?? []).map((a) => [a.product_id, Number(a.available)]));
  const barcodeMap = new Map<string, string>();
  (barcodes ?? []).forEach((b) => barcodeMap.set(b.barcode, b.product_id));

  const items: PosProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    base_unit: p.base_unit,
    price: Number(p.default_sale_price),
    available: availMap.get(p.id) ?? 0,
  }));

  const barcodeIndex: Record<string, string> = {};
  (barcodes ?? []).forEach((b) => { barcodeIndex[b.barcode] = b.product_id; });

  return (
    <PosClient
      products={items}
      barcodeIndex={barcodeIndex}
      customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
    />
  );
}
