"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function updateSettings(patch: {
  store_name?: string;
  costing_method?: "WEIGHTED_AVERAGE" | "FIFO";
  tax_percent?: number;
  currency?: string;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return { error: "Only the owner can change settings." };
  const db = createAdminClient();
  const { error } = await db.from("settings").update({ ...patch }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserRole(userId: string, role: "owner" | "manager" | "cashier") {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return { error: "Only the owner can manage users." };
  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
