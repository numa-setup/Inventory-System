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

export async function checkoutSale(input: {
  lines: CartLine[];
  customer_id?: string | null;
  payment_method: "CASH" | "UDHAAR" | "CARD";
  discount?: number;
  idempotency_key: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  if (!input.lines.length) return { error: "Cart is empty." };
  if (input.payment_method === "UDHAAR" && !input.customer_id) {
    return { error: "Pick a customer for udhaar (khata) sales." };
  }

  const db = createAdminClient();

  // Idempotency: if a move with this key already exists, the sale was processed.
  const { data: dupe } = await db
    .from("stock_moves").select("reference_id")
    .eq("idempotency_key", `${input.idempotency_key}-0`).maybeSingle();
  if (dupe) return { ok: true, duplicate: true, sale_id: dupe.reference_id };

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
  const discount = input.discount ?? 0;
  const total = Math.max(subtotal - discount, 0);
  const profit = total - cogsTotal;
  const receiptNo = `R-${Date.now().toString().slice(-8)}`;

  const { data: sale, error: sErr } = await db
    .from("sales")
    .insert({
      receipt_no: receiptNo, customer_id: input.customer_id || null, location_id: main,
      subtotal, discount, tax: 0, total, cogs_total: cogsTotal, profit, cashier_id: user.id,
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

  await db.from("payments").insert({ sale_id: saleId, method: input.payment_method, amount: total });

  if (input.payment_method === "UDHAAR" && input.customer_id) {
    const { data: c } = await db.from("customers").select("credit_balance").eq("id", input.customer_id).single();
    const newBal = Number(c?.credit_balance ?? 0) + total;
    await db.from("customer_ledger").insert({
      customer_id: input.customer_id, type: "CHARGE", amount: total,
      reference: `Sale ${receiptNo}`, balance_after: newBal, created_by: user.id,
    });
    await db.from("customers").update({ credit_balance: newBal }).eq("id", input.customer_id);
  }

  revalidatePath("/stock");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { ok: true, sale_id: saleId, receipt_no: sale.receipt_no, total, profit };
}
