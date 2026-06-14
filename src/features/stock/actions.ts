"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

async function locationIds(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("locations").select("id, code");
  const map = new Map((data ?? []).map((l) => [l.code, l.id as string]));
  return map;
}

export async function adjustStock(input: {
  product_id: string;
  direction: "add" | "remove";
  qty: number;
  reason: string;
  unit_cost?: number | null;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) {
    return { error: "Not authorized." };
  }
  if (!input.qty || input.qty <= 0) return { error: "Quantity must be greater than 0." };

  const db = createAdminClient();
  const locs = await locationIds(db);
  const main = locs.get("MAIN");
  const adj = locs.get("ADJUSTMENT");
  const loss = locs.get("LOSS");
  if (!main || !adj || !loss) return { error: "Locations not configured." };

  const move =
    input.direction === "add"
      ? { from_location_id: adj, to_location_id: main }
      : { from_location_id: main, to_location_id: loss };

  const { error } = await db.from("stock_moves").insert({
    product_id: input.product_id,
    qty: input.qty,
    ...move,
    unit_cost: input.direction === "add" ? (input.unit_cost ?? 0) : null,
    reference_type: "ADJUSTMENT",
    source: "MANUAL",
    created_by: user.id,
    note: input.reason,
  });
  if (error) return { error: error.message };

  await db.from("audit_log").insert({
    actor: user.id,
    action: "stock_adjustment",
    entity: "products",
    entity_id: input.product_id,
    after: { direction: input.direction, qty: input.qty, reason: input.reason },
  });

  revalidatePath("/stock");
  revalidatePath("/products");
  return { ok: true };
}
