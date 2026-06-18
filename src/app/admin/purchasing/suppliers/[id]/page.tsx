import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVariantOptions } from "@/lib/catalog";
import { SupplierDetailClient } from "@/features/purchasing/SupplierDetailClient";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", id).single();
  if (!supplier) notFound();

  const [variants, { data: ledger }, { data: receipts }, { data: pos }] = await Promise.all([
    getVariantOptions(supabase),
    supabase.from("supplier_ledger").select("id, type, amount, reference, balance_after, created_at").eq("supplier_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("goods_receipts").select("id, grn_no, total, created_at").eq("supplier_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("purchase_orders").select("id, po_no, status, total, expected_at, created_at").eq("supplier_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  // products supplied: variants seen across this supplier's receipts
  const grnIds = (receipts ?? []).map((r) => r.id);
  const { data: items } = grnIds.length
    ? await supabase.from("goods_receipt_items").select("variant_id, qty, unit_cost").in("grn_id", grnIds)
    : { data: [] as { variant_id: string; qty: number; unit_cost: number }[] };

  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const supplied = new Map<string, { name: string; label: string; sku: string; qty: number; lastCost: number }>();
  for (const it of items ?? []) {
    const v = vMap.get(it.variant_id);
    if (!v) continue;
    const cur = supplied.get(it.variant_id) ?? { name: v.product_name, label: v.label, sku: v.sku, qty: 0, lastCost: Number(it.unit_cost) };
    cur.qty += Number(it.qty);
    cur.lastCost = Number(it.unit_cost);
    supplied.set(it.variant_id, cur);
  }

  return (
    <SupplierDetailClient
      supplier={{
        id: supplier.id, name: supplier.name, contact_person: supplier.contact_person,
        phone: supplier.phone, email: supplier.email, address: supplier.address, city: supplier.city,
        ntn: supplier.ntn, payment_terms: supplier.payment_terms, bank_details: supplier.bank_details,
        opening_balance: Number(supplier.opening_balance), balance: Number(supplier.balance), notes: supplier.notes,
      }}
      ledger={(ledger ?? []).map((l) => ({ id: l.id, type: l.type, amount: Number(l.amount), reference: l.reference, balance_after: Number(l.balance_after), created_at: l.created_at }))}
      receipts={(receipts ?? []).map((r) => ({ id: r.id, grn_no: r.grn_no, total: Number(r.total), created_at: r.created_at }))}
      pos={(pos ?? []).map((p) => ({ id: p.id, po_no: p.po_no, status: p.status, total: Number(p.total), expected_at: p.expected_at, created_at: p.created_at }))}
      supplied={[...supplied.values()]}
    />
  );
}
