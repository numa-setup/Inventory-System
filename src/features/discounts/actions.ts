"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function createDiscount(input: {
  name: string;
  type: "PERCENT" | "FIXED" | "BOGO" | "FREE_DELIVERY";
  value: number;
  scope: "PRODUCT" | "CATEGORY" | "CART";
  code?: string | null;
  min_amount?: number;
  start_at?: string | null;
  end_at?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  if (!input.name.trim()) return { error: "Name is required." };
  const db = createAdminClient();
  const { error } = await db.from("discounts").insert({
    name: input.name.trim(),
    type: input.type,
    value: input.value,
    scope: input.scope,
    code: input.code || null,
    min_amount: input.min_amount ?? 0,
    start_at: input.start_at || null,
    end_at: input.end_at || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/discounts");
  return { ok: true };
}

export async function toggleDiscount(id: string, active: boolean) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("discounts").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/discounts");
  return { ok: true };
}
