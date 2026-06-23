import { createAdminClient } from "@hamza/shared/supabase/admin";
import { getOrderByNo } from "@/lib/storefront";
import { notifyOrderPlaced } from "@hamza/shared/notifications/dispatch";
import type { OnlineMethod } from "@/features/storefront/order-actions";

/**
 * Credit an online order: record the payment, confirm the order, and send the
 * confirmation. Idempotent (a retry / duplicate webhook won't double-credit).
 * Shared by the sandbox confirm action and the live gateway webhook/return.
 */
export async function creditOrder(orderNo: string, method: OnlineMethod): Promise<{ ok: true } | { error: string }> {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("id, status, total").eq("order_no", orderNo).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status === "CANCELLED") return { error: "Order was cancelled." };

  const { data: existing } = await db.from("payments").select("id").eq("order_id", order.id).limit(1).maybeSingle();
  if (existing) return { ok: true }; // already credited

  await db.from("payments").insert({ order_id: order.id, method, amount: Number(order.total) });
  await db.from("orders").update({ payment_type: method, status: order.status === "PLACED" ? "CONFIRMED" : order.status }).eq("id", order.id);

  const full = await getOrderByNo(orderNo);
  if (full) {
    await notifyOrderPlaced({
      order_no: full.order_no,
      customer_name: full.customer_name,
      customer_phone: full.customer_phone,
      address: full.address,
      total: full.total,
      items: full.items.map((i) => ({ title: i.title, qty: i.qty, line_total: i.line_total })),
    });
  }
  return { ok: true };
}
