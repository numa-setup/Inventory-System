"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/notifications/dispatch";

const NOTIFY_AT = new Set(["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]);

// Allowed forward transitions. Stock is deducted (via the ledger) the first time
// an order ships; cancelling before that releases the held stock.
const FORWARD: Record<string, string[]> = {
  PLACED: ["CONFIRMED", "PACKED", "SHIPPED", "CANCELLED"],
  CONFIRMED: ["PACKED", "SHIPPED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
const DEDUCT_AT = new Set(["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const db = createAdminClient();

  const { data: order } = await db.from("orders").select("id, status, order_no, customer_name, customer_phone").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (!FORWARD[order.status]?.includes(newStatus)) {
    return { error: `Can’t move ${order.status} → ${newStatus}.` };
  }

  // Has stock already been deducted for this order? (idempotent fulfilment)
  const { data: existingMove } = await db
    .from("stock_moves").select("id").eq("reference_type", "SALE").eq("reference_id", orderId).limit(1).maybeSingle();
  const alreadyDeducted = !!existingMove;

  // Ship: deduct stock through the ledger and commit the reservations.
  if (DEDUCT_AT.has(newStatus) && !alreadyDeducted) {
    const { data: items } = await db.from("order_items").select("product_id, variant_id, qty").eq("order_id", orderId);
    const lines = (items ?? []).filter((i) => i.variant_id);
    const { data: locs } = await db.from("locations").select("id, code").in("code", ["MAIN", "CUST"]);
    const main = locs?.find((l) => l.code === "MAIN")?.id;
    const cust = locs?.find((l) => l.code === "CUST")?.id;
    if (!main || !cust) return { error: "Locations not configured." };

    const variantIds = lines.map((l) => l.variant_id);
    const { data: avail } = await db.from("variant_availability").select("variant_id, avg_cost").in("variant_id", variantIds);
    const costMap = new Map((avail ?? []).map((a) => [a.variant_id, Number(a.avg_cost)]));

    const moves = lines.map((it, i) => ({
      product_id: it.product_id, variant_id: it.variant_id, qty: Number(it.qty),
      from_location_id: main, to_location_id: cust, unit_cost: costMap.get(it.variant_id) ?? 0,
      reference_type: "SALE" as const, reference_id: orderId, source: "SYSTEM" as const,
      idempotency_key: `ord-${orderId}-${i}`, created_by: user.id, note: `Web order ${order.order_no}`,
    }));
    if (moves.length) {
      const { error: mErr } = await db.from("stock_moves").insert(moves);
      if (mErr) {
        return { error: mErr.message.includes("Insufficient") ? "Not enough stock to fulfil this order." : mErr.message };
      }
    }
    // Commit the holds (the trigger releases stock_levels.reserved).
    await db.from("reservations").update({ status: "COMMITTED" }).eq("order_id", orderId).eq("status", "HELD");
  }

  // Cancel before shipping: release the held stock back to availability.
  if (newStatus === "CANCELLED" && !alreadyDeducted) {
    await db.from("reservations").update({ status: "RELEASED" }).eq("order_id", orderId).eq("status", "HELD");
  }

  const { error } = await db.from("orders").update({ status: newStatus }).eq("id", orderId);
  if (error) return { error: error.message };

  // Best-effort customer notification on shipping/delivery/cancellation.
  if (NOTIFY_AT.has(newStatus)) {
    await notifyOrderStatus({ order_no: order.order_no, customer_name: order.customer_name, customer_phone: order.customer_phone }, newStatus);
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/stock");
  return { ok: true as const };
}
