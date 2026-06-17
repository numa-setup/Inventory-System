"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export interface CartLine {
  variant_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
}

/** Quick-add a customer at the counter (returns the new id to attach immediately). */
export async function quickAddCustomer(name: string, phone?: string | null) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  if (!name.trim()) return { error: "Name is required." };
  const db = createAdminClient();
  const { data, error } = await db
    .from("customers")
    .insert({ name: name.trim(), phone: phone?.trim() || null })
    .select("id, name, phone")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true as const, customer: { id: data.id as string, name: data.name as string, phone: (data.phone as string) ?? null } };
}

export type PayMethod = "CASH" | "CARD" | "BANK" | "JAZZCASH" | "EASYPAISA" | "WALLET" | "UDHAAR" | "COD";
export interface PaymentInput {
  method: PayMethod;
  amount: number;
}

export interface CheckoutResult {
  ok: true;
  sale_id: string;
  receipt_no: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  profit: number;
  payments: PaymentInput[];
  duplicate?: boolean;
}

export async function checkoutSale(input: {
  lines: CartLine[];
  customer_id?: string | null;
  payments: PaymentInput[];
  discount?: number;
  idempotency_key: string;
}): Promise<CheckoutResult | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  if (!input.lines.length) return { error: "Cart is empty." };
  if (!input.payments?.length) return { error: "Add a payment." };

  const hasUdhaar = input.payments.some((p) => p.method === "UDHAAR");
  if (hasUdhaar && !input.customer_id) {
    return { error: "Pick a customer for udhaar (khata) sales." };
  }

  const db = createAdminClient();

  // Idempotency: if a move with this key already exists, the sale was processed.
  const { data: dupe } = await db
    .from("stock_moves").select("reference_id")
    .eq("idempotency_key", `${input.idempotency_key}-0`).maybeSingle();
  if (dupe) {
    const { data: prev } = await db
      .from("sales").select("receipt_no, subtotal, discount, tax, total, profit").eq("id", dupe.reference_id).maybeSingle();
    return {
      ok: true, duplicate: true, sale_id: dupe.reference_id, receipt_no: prev?.receipt_no ?? "",
      subtotal: Number(prev?.subtotal ?? 0), discount: Number(prev?.discount ?? 0), tax: Number(prev?.tax ?? 0),
      total: Number(prev?.total ?? 0), profit: Number(prev?.profit ?? 0), payments: input.payments,
    };
  }

  const { data: locs } = await db.from("locations").select("id, code").in("code", ["MAIN", "CUST"]);
  const main = locs?.find((l) => l.code === "MAIN")?.id;
  const cust = locs?.find((l) => l.code === "CUST")?.id;
  if (!main || !cust) return { error: "Locations not configured." };

  const variantIds = input.lines.map((l) => l.variant_id);
  const { data: avail } = await db
    .from("variant_availability").select("variant_id, avg_cost").in("variant_id", variantIds);
  const costMap = new Map((avail ?? []).map((a) => [a.variant_id, Number(a.avg_cost)]));

  let subtotal = 0, cogsTotal = 0;
  const items = input.lines.map((l) => {
    const lineTotal = l.qty * l.unit_price;
    const unitCogs = costMap.get(l.variant_id) ?? 0;
    subtotal += lineTotal;
    cogsTotal += l.qty * unitCogs;
    return { ...l, line_total: lineTotal, unit_cogs: unitCogs };
  });

  // Tax + invoice prefix come from settings.
  const { data: settings } = await db.from("settings").select("tax_percent, store_info").eq("id", 1).maybeSingle();
  const taxPercent = Number(settings?.tax_percent ?? 0);
  const prefix = ((settings?.store_info as Record<string, unknown> | null)?.invoice_prefix as string) || "INV";

  const discount = Math.max(input.discount ?? 0, 0);
  const taxable = Math.max(subtotal - discount, 0);
  const tax = Math.round(taxable * taxPercent) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  const profit = total - tax - cogsTotal;

  // Payments must settle the bill exactly (cash change is handled in the UI;
  // the applied cash amount is sent, not the tendered amount).
  const paid = input.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (Math.abs(paid - total) > 0.5) {
    return { error: `Payments (Rs ${paid.toFixed(0)}) must equal the total (Rs ${total.toFixed(0)}).` };
  }

  const receiptNo = `${prefix}-${Date.now().toString().slice(-8)}`;

  const { data: sale, error: sErr } = await db
    .from("sales")
    .insert({
      receipt_no: receiptNo, customer_id: input.customer_id || null, location_id: main,
      subtotal, discount, tax, total, cogs_total: cogsTotal, profit, cashier_id: user.id,
    })
    .select("id, receipt_no").single();
  if (sErr) return { error: sErr.message };
  const saleId = sale.id as string;

  await db.from("sale_items").insert(
    items.map((it) => ({
      sale_id: saleId, product_id: it.product_id, variant_id: it.variant_id,
      qty: it.qty, unit_price: it.unit_price, unit_cogs: it.unit_cogs, line_total: it.line_total,
    })),
  );

  const moves = items.map((it, i) => ({
    product_id: it.product_id, variant_id: it.variant_id, qty: it.qty,
    from_location_id: main, to_location_id: cust, unit_cost: it.unit_cogs,
    reference_type: "SALE" as const, reference_id: saleId, source: "SCAN" as const,
    idempotency_key: `${input.idempotency_key}-${i}`, created_by: user.id,
  }));
  const { error: mErr } = await db.from("stock_moves").insert(moves);
  if (mErr) return { error: mErr.message };

  await db.from("payments").insert(
    input.payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ sale_id: saleId, method: p.method, amount: Number(p.amount) })),
  );

  // Any udhaar portion goes on the customer's khata.
  if (hasUdhaar && input.customer_id) {
    const udhaar = input.payments.filter((p) => p.method === "UDHAAR").reduce((s, p) => s + Number(p.amount), 0);
    if (udhaar > 0) {
      const { data: c } = await db.from("customers").select("credit_balance").eq("id", input.customer_id).single();
      const newBal = Number(c?.credit_balance ?? 0) + udhaar;
      await db.from("customer_ledger").insert({
        customer_id: input.customer_id, type: "CHARGE", amount: udhaar,
        reference: `Sale ${receiptNo}`, balance_after: newBal, created_by: user.id,
      });
      await db.from("customers").update({ credit_balance: newBal }).eq("id", input.customer_id);
    }
  }

  revalidatePath("/stock");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return {
    ok: true, sale_id: saleId, receipt_no: sale.receipt_no, subtotal, discount, tax, total, profit,
    payments: input.payments,
  };
}
