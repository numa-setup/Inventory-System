"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function createSupplier(input: {
  name: string; phone?: string | null; address?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  if (!input.name.trim()) return { error: "Name is required." };
  const db = createAdminClient();
  const { error } = await db.from("suppliers").insert({
    name: input.name.trim(), phone: input.phone || null, address: input.address || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/purchasing");
  return { ok: true };
}

/** Quick goods receipt: receive stock into MAIN from a supplier, recording cost. */
export async function receiveStock(input: {
  supplier_id?: string | null;
  product_id: string;
  qty: number;
  unit_cost: number;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  if (!input.qty || input.qty <= 0) return { error: "Quantity must be greater than 0." };

  const db = createAdminClient();
  const { data: locs } = await db.from("locations").select("id, code").in("code", ["SUP", "MAIN"]);
  const sup = locs?.find((l) => l.code === "SUP")?.id;
  const main = locs?.find((l) => l.code === "MAIN")?.id;
  if (!sup || !main) return { error: "Locations not configured." };

  const grnNo = `GRN-${Date.now().toString().slice(-8)}`;
  const { data: grn, error: gErr } = await db.from("goods_receipts").insert({
    grn_no: grnNo,
    supplier_id: input.supplier_id || null,
    location_id: main,
    received_by: user.id,
  }).select("id").single();
  if (gErr) return { error: gErr.message };

  await db.from("goods_receipt_items").insert({
    grn_id: grn.id, product_id: input.product_id, qty: input.qty, unit_cost: input.unit_cost,
  });

  const { error: mErr } = await db.from("stock_moves").insert({
    product_id: input.product_id,
    qty: input.qty,
    from_location_id: sup,
    to_location_id: main,
    unit_cost: input.unit_cost,
    reference_type: "PURCHASE",
    reference_id: grn.id,
    source: "MANUAL",
    created_by: user.id,
    note: `Goods receipt ${grnNo}`,
  });
  if (mErr) return { error: mErr.message };

  revalidatePath("/purchasing");
  revalidatePath("/stock");
  revalidatePath("/products");
  return { ok: true, grn_no: grnNo };
}
