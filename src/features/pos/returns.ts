"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { returnSchema, firstIssue } from "@/lib/validation";
import type { PayMethod } from "./actions";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ReturnableItem {
  sale_item_id: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  label: string;
  qty: number;
  returned: number;
  remaining: number;
  unit_price: number;
  unit_cogs: number;
}

export interface SaleForReturn {
  sale_id: string;
  receipt_no: string;
  created_at: string;
  customer_id: string | null;
  within_window: boolean;
  window_days: number;
  items: ReturnableItem[];
}

/** Look up a sale by receipt number and return its still-returnable lines. */
export async function getSaleForReturn(receiptNo: string): Promise<SaleForReturn | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const db = createAdminClient();

  const { data: sale } = await db
    .from("sales").select("id, receipt_no, created_at, customer_id")
    .eq("receipt_no", receiptNo.trim()).maybeSingle();
  if (!sale) return { error: "No sale found with that receipt number." };

  const { data: items } = await db
    .from("sale_items").select("id, product_id, variant_id, qty, unit_price, unit_cogs").eq("sale_id", sale.id);
  const saleItemIds = (items ?? []).map((i) => i.id);

  const { data: rets } = saleItemIds.length
    ? await db.from("sale_return_items").select("sale_item_id, qty").in("sale_item_id", saleItemIds)
    : { data: [] as { sale_item_id: string; qty: number }[] };
  const retMap = new Map<string, number>();
  for (const r of rets ?? []) retMap.set(r.sale_item_id, (retMap.get(r.sale_item_id) ?? 0) + Number(r.qty));

  const variantIds = [...new Set((items ?? []).map((i) => i.variant_id).filter(Boolean))] as string[];
  const { data: cat } = variantIds.length
    ? await db.from("catalog_index").select("variant_id, product_name, label").in("variant_id", variantIds)
    : { data: [] as { variant_id: string; product_name: string; label: string }[] };
  const nameMap = new Map((cat ?? []).map((c) => [c.variant_id, c]));

  const { data: settings } = await db.from("settings").select("store_info").eq("id", 1).maybeSingle();
  const windowDays = Number((settings?.store_info as Record<string, unknown> | null)?.return_window_days ?? 7);
  const ageDays = (Date.now() - new Date(sale.created_at).getTime()) / 86_400_000;
  const within = windowDays <= 0 || ageDays <= windowDays;

  const list: ReturnableItem[] = (items ?? []).map((it) => {
    const returned = retMap.get(it.id) ?? 0;
    const c = it.variant_id ? nameMap.get(it.variant_id) : null;
    return {
      sale_item_id: it.id, product_id: it.product_id, variant_id: it.variant_id,
      name: c?.product_name ?? "Item", label: c?.label ?? "",
      qty: Number(it.qty), returned, remaining: round2(Math.max(0, Number(it.qty) - returned)),
      unit_price: Number(it.unit_price), unit_cogs: Number(it.unit_cogs),
    };
  });

  return {
    sale_id: sale.id, receipt_no: sale.receipt_no, created_at: sale.created_at,
    customer_id: sale.customer_id, within_window: within, window_days: windowDays, items: list,
  };
}

/** Process a counter return: reverse stock back into inventory and refund. */
export async function processReturn(input: {
  sale_id: string;
  receipt_no: string;
  items: { sale_item_id: string; product_id: string; variant_id: string | null; qty: number; unit_price: number; unit_cogs: number }[];
  reason?: string | null;
  refund_method: PayMethod;
  customer_id?: string | null;
  idempotency_key: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const picked = input.items.filter((i) => i.qty > 0);
  if (!picked.length) return { error: "Select at least one item to return." };

  const db = createAdminClient();

  // Idempotency: a retried submit must not refund twice.
  const { data: dupe } = await db
    .from("stock_moves").select("reference_id").eq("idempotency_key", `${input.idempotency_key}-0`).maybeSingle();
  if (dupe) return { ok: true, duplicate: true, return_id: dupe.reference_id, total: 0 };

  // Validate quantities against what's still returnable.
  const saleItemIds = picked.map((i) => i.sale_item_id);
  const { data: origItems } = await db.from("sale_items").select("id, qty").in("id", saleItemIds);
  const origMap = new Map((origItems ?? []).map((i) => [i.id, Number(i.qty)]));
  const { data: rets } = await db.from("sale_return_items").select("sale_item_id, qty").in("sale_item_id", saleItemIds);
  const retMap = new Map<string, number>();
  for (const r of rets ?? []) retMap.set(r.sale_item_id, (retMap.get(r.sale_item_id) ?? 0) + Number(r.qty));
  for (const it of picked) {
    const remaining = (origMap.get(it.sale_item_id) ?? 0) - (retMap.get(it.sale_item_id) ?? 0);
    if (it.qty > remaining + 1e-6) return { error: "Return quantity exceeds what was sold." };
  }

  // Return window.
  const { data: sale } = await db.from("sales").select("created_at, customer_id").eq("id", input.sale_id).maybeSingle();
  const { data: settings } = await db.from("settings").select("store_info").eq("id", 1).maybeSingle();
  const windowDays = Number((settings?.store_info as Record<string, unknown> | null)?.return_window_days ?? 7);
  if (sale && windowDays > 0) {
    const age = (Date.now() - new Date(sale.created_at).getTime()) / 86_400_000;
    if (age > windowDays) return { error: `Outside the ${windowDays}-day return window.` };
  }

  const total = round2(picked.reduce((s, i) => s + i.qty * i.unit_price, 0));

  const { data: locs } = await db.from("locations").select("id, code").in("code", ["MAIN", "CUST"]);
  const main = locs?.find((l) => l.code === "MAIN")?.id;
  const cust = locs?.find((l) => l.code === "CUST")?.id;
  if (!main || !cust) return { error: "Locations not configured." };

  const { data: ret, error: rErr } = await db
    .from("sale_returns")
    .insert({ sale_id: input.sale_id, receipt_no: input.receipt_no, total, refund_method: input.refund_method, reason: input.reason || null, created_by: user.id })
    .select("id").single();
  if (rErr) return { error: rErr.message };
  const returnId = ret.id as string;

  await db.from("sale_return_items").insert(
    picked.map((i) => ({
      return_id: returnId, sale_item_id: i.sale_item_id, product_id: i.product_id, variant_id: i.variant_id,
      qty: i.qty, unit_price: i.unit_price, unit_cogs: i.unit_cogs, line_total: round2(i.qty * i.unit_price),
    })),
  );

  // Reverse stock back into inventory at the original COGS (so avg cost isn't skewed).
  const moves = picked.map((i, idx) => ({
    product_id: i.product_id, variant_id: i.variant_id, qty: i.qty,
    from_location_id: cust, to_location_id: main, unit_cost: i.unit_cogs,
    reference_type: "RETURN" as const, reference_id: returnId, source: "MANUAL" as const,
    idempotency_key: `${input.idempotency_key}-${idx}`, created_by: user.id, note: "Counter return",
  }));
  const { error: mErr } = await db.from("stock_moves").insert(moves);
  if (mErr) return { error: mErr.message };

  // Refund: to khata (reduces what they owe) or as a negative payment (cash/card/etc.).
  const cid = input.customer_id || sale?.customer_id || null;
  if (input.refund_method === "UDHAAR" && cid) {
    const { data: c } = await db.from("customers").select("credit_balance").eq("id", cid).single();
    const newBal = Number(c?.credit_balance ?? 0) - total;
    await db.from("customer_ledger").insert({
      customer_id: cid, type: "PAYMENT", amount: total, reference: `Return ${input.receipt_no}`,
      balance_after: newBal, created_by: user.id,
    });
    await db.from("customers").update({ credit_balance: newBal }).eq("id", cid);
  } else {
    await db.from("payments").insert({ sale_id: input.sale_id, method: input.refund_method, amount: -total });
  }

  revalidatePath("/stock");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  return { ok: true as const, return_id: returnId, total };
}
