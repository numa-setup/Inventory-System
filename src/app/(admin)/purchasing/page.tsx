import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getVariantOptions } from "@/lib/catalog";
import { PurchasingClient, type SupplierRow, type PORow, type ReceiptRow } from "@/features/purchasing/PurchasingClient";

export const metadata: Metadata = { title: "Purchasing" };

export default async function PurchasingPage() {
  const supabase = await createClient();
  const [variants, { data: suppliers }, { data: pos }, { data: receipts }] = await Promise.all([
    getVariantOptions(supabase),
    supabase.from("suppliers").select("id, name, contact_person, phone, email, city, payment_terms, balance, active").order("name"),
    supabase.from("purchase_orders").select("id, po_no, supplier_id, status, expected_at, total, created_at").order("created_at", { ascending: false }).limit(15),
    supabase.from("goods_receipts").select("id, grn_no, supplier_id, total, created_at").order("created_at", { ascending: false }).limit(15),
  ]);

  const supMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const supplierRows: SupplierRow[] = (suppliers ?? []).map((s) => ({
    id: s.id, name: s.name, contact_person: s.contact_person, phone: s.phone,
    email: s.email, city: s.city, payment_terms: s.payment_terms,
    balance: Number(s.balance), active: s.active,
  }));

  const poRows: PORow[] = (pos ?? []).map((p) => ({
    id: p.id, po_no: p.po_no, supplier: p.supplier_id ? (supMap.get(p.supplier_id) ?? "—") : "—",
    status: p.status, expected_at: p.expected_at, total: Number(p.total), created_at: p.created_at,
  }));

  const receiptRows: ReceiptRow[] = (receipts ?? []).map((r) => ({
    id: r.id, grn_no: r.grn_no, supplier: r.supplier_id ? (supMap.get(r.supplier_id) ?? "—") : "—",
    total: Number(r.total), created_at: r.created_at,
  }));

  const payables = supplierRows.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const openPOs = poRows.filter((p) => p.status === "SENT" || p.status === "PARTIAL").length;

  return (
    <PurchasingClient
      variants={variants}
      suppliers={supplierRows}
      pos={poRows}
      receipts={receiptRows}
      kpis={{ payables, suppliers: supplierRows.length, openPOs }}
    />
  );
}
