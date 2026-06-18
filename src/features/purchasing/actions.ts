"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

type Db = ReturnType<typeof createAdminClient>;

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return null;
  return user;
}

/**
 * Link a scanned-but-unknown barcode to an existing variant (used by the
 * receiving scan flow when a delivered item has no barcode on file yet).
 */
export async function linkBarcode(variantId: string, productId: string, barcode: string) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const code = barcode.trim();
  if (!code) return { error: "Empty barcode." };
  const db = createAdminClient();
  const { data: existing } = await db
    .from("product_barcodes")
    .select("variant_id")
    .eq("barcode", code)
    .maybeSingle();
  if (existing) {
    return existing.variant_id === variantId
      ? { ok: true }
      : { error: "That barcode is already linked to another item." };
  }
  const { error } = await db.from("product_barcodes").insert({
    product_id: productId,
    variant_id: variantId,
    barcode: code,
    type: /^\d{13}$/.test(code) ? "EAN" : "INTERNAL",
    is_primary: false,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/products");
  return { ok: true };
}

export interface SupplierInput {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  ntn?: string | null;
  payment_terms?: string | null;
  bank_details?: string | null;
  opening_balance?: number | null;
  notes?: string | null;
}

export async function createSupplier(input: SupplierInput) {
  if (!(await requireManager())) return { error: "Not authorized." };
  if (!input.name.trim()) return { error: "Company name is required." };
  const db = createAdminClient();
  const opening = input.opening_balance ?? 0;
  const { error } = await db.from("suppliers").insert({
    name: input.name.trim(),
    contact_person: input.contact_person || null,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    city: input.city || null,
    ntn: input.ntn || null,
    payment_terms: input.payment_terms || null,
    bank_details: input.bank_details || null,
    notes: input.notes || null,
    opening_balance: opening,
    balance: opening,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/purchasing");
  return { ok: true };
}

export async function updateSupplier(id: string, input: SupplierInput) {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("suppliers").update({
    name: input.name.trim(),
    contact_person: input.contact_person || null,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    city: input.city || null,
    ntn: input.ntn || null,
    payment_terms: input.payment_terms || null,
    bank_details: input.bank_details || null,
    notes: input.notes || null,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/purchasing");
  revalidatePath(`/admin/purchasing/suppliers/${id}`);
  return { ok: true };
}

/** Record a payment to a supplier (reduces our payable). */
export async function recordSupplierPayment(input: { supplier_id: string; amount: number; reference?: string }) {
  const user = await requireManager();
  if (!user) return { error: "Not authorized." };
  if (!input.amount || input.amount <= 0) return { error: "Amount must be greater than 0." };
  const db = createAdminClient();

  const { data: sup } = await db.from("suppliers").select("balance").eq("id", input.supplier_id).single();
  const newBalance = Number(sup?.balance ?? 0) - input.amount;
  await db.from("supplier_ledger").insert({
    supplier_id: input.supplier_id, type: "PAYMENT", amount: input.amount,
    reference: input.reference || "Payment", balance_after: newBalance, created_by: user.id,
  });
  await db.from("suppliers").update({ balance: newBalance }).eq("id", input.supplier_id);
  revalidatePath(`/admin/purchasing/suppliers/${input.supplier_id}`);
  revalidatePath("/admin/purchasing");
  return { ok: true };
}

/* ---------------- Purchase Orders ---------------- */

export interface POLineInput { variant_id: string; product_id: string; qty: number; unit_cost: number; }

export async function createPurchaseOrder(input: {
  supplier_id?: string | null;
  expected_at?: string | null;
  notes?: string | null;
  lines: POLineInput[];
}) {
  const user = await requireManager();
  if (!user) return { error: "Not authorized." };
  const lines = input.lines.filter((l) => l.variant_id && l.qty > 0);
  if (!lines.length) return { error: "Add at least one line item." };
  const db = createAdminClient();

  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const poNo = `PO-${Date.now().toString().slice(-8)}`;
  const { data: po, error } = await db.from("purchase_orders").insert({
    po_no: poNo, supplier_id: input.supplier_id || null, status: "SENT",
    expected_at: input.expected_at || null, subtotal: total, total,
    notes: input.notes || null, created_by: user.id,
  }).select("id").single();
  if (error) return { error: error.message };

  const { error: liErr } = await db.from("purchase_order_items").insert(
    lines.map((l) => ({
      po_id: po.id, product_id: l.product_id, variant_id: l.variant_id,
      qty: l.qty, unit_cost: l.unit_cost,
    })),
  );
  if (liErr) return { error: liErr.message };
  revalidatePath("/admin/purchasing");
  return { ok: true, po_no: poNo };
}

export async function setPOStatus(id: string, status: "DRAFT" | "SENT" | "CANCELLED") {
  if (!(await requireManager())) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("purchase_orders").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/purchasing");
  return { ok: true };
}

/* ---------------- Multi-product receiving ---------------- */

export interface ReceiveLineInput {
  variant_id: string;
  product_id: string;
  po_item_id?: string | null;
  qty: number;
  unit_cost: number;
  lot_number?: string | null;
  expiry?: string | null;
}

export async function receiveStock(input: {
  supplier_id?: string | null;
  po_id?: string | null;
  location_code?: string;
  note?: string | null;
  lines: ReceiveLineInput[];
}) {
  const user = await requireManager();
  if (!user) return { error: "Not authorized." };
  const lines = input.lines.filter((l) => l.variant_id && l.qty > 0);
  if (!lines.length) return { error: "Add at least one line to receive." };

  const db = createAdminClient();
  const { data: locs } = await db.from("locations").select("id, code");
  const sup = locs?.find((l) => l.code === "SUP")?.id;
  const dest = locs?.find((l) => l.code === (input.location_code ?? "MAIN"))?.id;
  if (!sup || !dest) return { error: "Locations not configured." };

  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const grnNo = `GRN-${Date.now().toString().slice(-8)}`;
  const { data: grn, error: gErr } = await db.from("goods_receipts").insert({
    grn_no: grnNo, po_id: input.po_id || null, supplier_id: input.supplier_id || null,
    location_id: dest, received_by: user.id, total, note: input.note || null,
  }).select("id").single();
  if (gErr) return { error: gErr.message };

  for (const l of lines) {
    const lotId = await resolveLot(db, l.variant_id, l.product_id, l.lot_number, l.expiry);
    await db.from("goods_receipt_items").insert({
      grn_id: grn.id, product_id: l.product_id, variant_id: l.variant_id,
      lot_id: lotId, qty: l.qty, unit_cost: l.unit_cost,
    });
    await db.from("stock_moves").insert({
      product_id: l.product_id, variant_id: l.variant_id, lot_id: lotId, qty: l.qty,
      from_location_id: sup, to_location_id: dest, unit_cost: l.unit_cost,
      reference_type: "PURCHASE", reference_id: grn.id, source: "MANUAL",
      created_by: user.id, note: `Goods receipt ${grnNo}`,
    });
    // sync the variant's standard cost to the latest purchase cost
    await db.from("product_variants").update({ cost: l.unit_cost }).eq("id", l.variant_id);
    // PO line received_qty (partial receipts)
    if (l.po_item_id) {
      const { data: item } = await db.from("purchase_order_items").select("received_qty").eq("id", l.po_item_id).single();
      await db.from("purchase_order_items")
        .update({ received_qty: Number(item?.received_qty ?? 0) + l.qty })
        .eq("id", l.po_item_id);
    }
  }

  // supplier payable += received value
  if (input.supplier_id) {
    const { data: s } = await db.from("suppliers").select("balance").eq("id", input.supplier_id).single();
    const newBalance = Number(s?.balance ?? 0) + total;
    await db.from("supplier_ledger").insert({
      supplier_id: input.supplier_id, type: "CHARGE", amount: total,
      reference: grnNo, balance_after: newBalance, created_by: user.id,
    });
    await db.from("suppliers").update({ balance: newBalance }).eq("id", input.supplier_id);
  }

  // update PO status (partial vs received)
  if (input.po_id) await refreshPOStatus(db, input.po_id);

  revalidatePath("/admin/purchasing");
  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  revalidatePath("/admin/dashboard");
  return { ok: true, grn_no: grnNo };
}

async function refreshPOStatus(db: Db, poId: string) {
  const { data: items } = await db.from("purchase_order_items").select("qty, received_qty").eq("po_id", poId);
  if (!items?.length) return;
  const fully = items.every((i) => Number(i.received_qty) >= Number(i.qty));
  const any = items.some((i) => Number(i.received_qty) > 0);
  const status = fully ? "RECEIVED" : any ? "PARTIAL" : "SENT";
  await db.from("purchase_orders").update({ status }).eq("id", poId);
}

async function resolveLot(db: Db, variantId: string, productId: string, lot?: string | null, expiry?: string | null) {
  if (!lot) return null;
  const { data: existing } = await db.from("lots").select("id")
    .eq("product_id", productId).eq("lot_number", lot).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created } = await db.from("lots")
    .insert({ product_id: productId, variant_id: variantId, lot_number: lot, expiry_date: expiry || null })
    .select("id").single();
  return (created?.id as string) ?? null;
}
