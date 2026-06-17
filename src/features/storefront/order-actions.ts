"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { placeOrderSchema, firstIssue } from "@/lib/validation";
import { round2 } from "@/lib/pricing";
import { getDeliveryConfig } from "@/lib/storefront";
import { notifyOrderPlaced } from "@/lib/notifications/dispatch";
import { getGatewayConfig } from "@/lib/payments/gateway";
import { creditOrder } from "@/lib/payments/credit";

export type OnlineMethod = "CARD" | "JAZZCASH" | "EASYPAISA" | "WALLET";
export interface PlaceOrderInput {
  items: { variant_id: string; product_id: string; qty: number; unit_price: number; title: string; variant_label?: string | null }[];
  customer: { name: string; phone: string; address: string; email?: string | null };
  payment_type: "COD" | OnlineMethod;
  note?: string | null;
}

/**
 * Place a web order: re-check stock, create the order + items + HELD reservations
 * (which hold stock so it can't be oversold), and link/create the customer.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<{ ok: true; order_no: string; requires_payment: boolean } | { error: string }> {
  const v = placeOrderSchema.safeParse(input);
  if (!v.success) return { error: firstIssue(v.error) };

  const db = createAdminClient();

  // Re-check availability server-side (the cart is the client's view).
  const variantIds = input.items.map((i) => i.variant_id);
  const { data: avail } = await db.from("variant_availability").select("variant_id, available").in("variant_id", variantIds);
  const availMap = new Map((avail ?? []).map((a) => [a.variant_id, Number(a.available)]));
  for (const it of input.items) {
    if (it.qty > (availMap.get(it.variant_id) ?? 0)) {
      return { error: `Sorry — “${it.title}” just sold out or doesn’t have enough stock.` };
    }
  }

  const subtotal = round2(input.items.reduce((s, i) => s + i.qty * i.unit_price, 0));
  const cfg = await getDeliveryConfig();
  const deliveryFee = subtotal >= cfg.freeOver ? 0 : cfg.fee;
  const total = round2(subtotal + deliveryFee);

  // Link or create the customer by phone (for loyalty / repeat orders).
  const phone = input.customer.phone.trim();
  let customerId: string | null = null;
  const { data: existing } = await db.from("customers").select("id").eq("phone", phone).maybeSingle();
  if (existing) customerId = existing.id as string;
  else {
    const { data: c } = await db
      .from("customers")
      .insert({ name: input.customer.name.trim(), phone, address: input.customer.address.trim() })
      .select("id").single();
    customerId = (c?.id as string) ?? null;
  }

  const { data: seq } = await db.rpc("next_web_order");
  const orderNo = `W-${String(Number(seq)).padStart(5, "0")}`;

  const { data: order, error } = await db
    .from("orders")
    .insert({
      order_no: orderNo, channel: "web", customer_id: customerId,
      customer_name: input.customer.name.trim(), customer_phone: phone, address: input.customer.address.trim(),
      status: "PLACED", payment_type: input.payment_type,
      subtotal, discount: 0, delivery_fee: deliveryFee, total,
    })
    .select("id, order_no").single();
  if (error || !order) return { error: error?.message ?? "Could not place the order." };
  const orderId = order.id as string;

  await db.from("order_items").insert(
    input.items.map((it) => ({
      order_id: orderId, product_id: it.product_id, variant_id: it.variant_id,
      qty: it.qty, unit_price: it.unit_price, line_total: round2(it.qty * it.unit_price),
    })),
  );

  // HELD reservations hold the stock (trigger increments stock_levels.reserved).
  const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const { error: rErr } = await db.from("reservations").insert(
    input.items.map((it) => ({
      order_id: orderId, product_id: it.product_id, variant_id: it.variant_id,
      qty: it.qty, status: "HELD", expires_at: expires,
    })),
  );
  if (rErr) {
    await db.from("orders").delete().eq("id", orderId); // cascades items
    return { error: "Some items just went out of stock. Please review your bag." };
  }

  const requiresPayment = input.payment_type !== "COD";

  // COD: confirm right away. Online: confirmation is sent after payment succeeds.
  if (!requiresPayment) {
    await notifyOrderPlaced({
      order_no: orderNo,
      customer_name: input.customer.name.trim(),
      customer_phone: phone,
      customer_email: input.customer.email || null,
      address: input.customer.address.trim(),
      total,
      items: input.items.map((it) => ({ title: it.title, qty: it.qty, line_total: round2(it.qty * it.unit_price) })),
    });
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true, order_no: orderNo, requires_payment: requiresPayment };
}

/**
 * Confirm an online payment in sandbox mode (no real gateway connected yet).
 * Records the payment, marks the order CONFIRMED, and sends the confirmation.
 * In live mode the order is credited by the verified gateway webhook instead.
 */
export async function confirmOnlinePayment(orderNo: string, method: OnlineMethod) {
  const cfg = await getGatewayConfig();
  if (cfg.mode === "live") return { error: "Live payments are confirmed by the gateway." };

  const res = await creditOrder(orderNo, method);
  if ("error" in res) return res;
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true as const, order_no: orderNo };
}
