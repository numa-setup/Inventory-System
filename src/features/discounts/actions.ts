"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export interface DiscountInput {
  name: string;
  type: "PERCENT" | "FIXED" | "BOGO" | "FREE_DELIVERY";
  value: number;
  scope: "PRODUCT" | "CATEGORY" | "CART";
  code?: string | null;
  min_amount?: number;
  target_id?: string | null;
  buy_qty?: number;
  get_qty?: number;
  get_discount_percent?: number;
  start_at?: string | null;
  end_at?: string | null;
  description?: string | null;
  active?: boolean;
}

function normalize(input: DiscountInput) {
  const isProductOrCat = input.scope === "PRODUCT" || input.scope === "CATEGORY";
  return {
    name: input.name.trim(),
    type: input.type,
    value: input.type === "BOGO" || input.type === "FREE_DELIVERY" ? 0 : Math.max(Number(input.value) || 0, 0),
    scope: input.scope,
    code: input.code?.trim() ? input.code.trim() : null,
    min_amount: Math.max(Number(input.min_amount) || 0, 0),
    target_id: isProductOrCat ? input.target_id || null : null,
    buy_qty: Math.max(Number(input.buy_qty) || 1, 1),
    get_qty: Math.max(Number(input.get_qty) || 1, 1),
    get_discount_percent: Math.min(Math.max(Number(input.get_discount_percent) || 100, 0), 100),
    start_at: input.start_at || null,
    end_at: input.end_at || null,
    description: input.description?.trim() || null,
  };
}

function validate(d: ReturnType<typeof normalize>): string | null {
  if (!d.name) return "Name is required.";
  if ((d.type === "PERCENT" || d.type === "FIXED") && d.value <= 0) return "Enter a discount value greater than zero.";
  if (d.type === "PERCENT" && d.value > 100) return "A percentage discount can’t be more than 100%.";
  if ((d.scope === "PRODUCT" || d.scope === "CATEGORY") && !d.target_id) return `Pick which ${d.scope === "PRODUCT" ? "product" : "category"} this applies to.`;
  if (d.end_at && d.start_at && new Date(d.end_at) < new Date(d.start_at)) return "The end date can’t be before the start date.";
  return null;
}

export async function createDiscount(input: DiscountInput) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const d = normalize(input);
  const err = validate(d);
  if (err) return { error: err };
  const db = createAdminClient();
  const { error } = await db.from("discounts").insert(d);
  if (error) return { error: error.message.includes("duplicate") ? "That coupon code is already in use." : error.message };
  revalidateDiscountSurfaces();
  return { ok: true as const };
}

export async function updateDiscount(id: string, input: DiscountInput) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const d = normalize(input);
  const err = validate(d);
  if (err) return { error: err };
  const db = createAdminClient();
  const { error } = await db.from("discounts").update(d).eq("id", id);
  if (error) return { error: error.message.includes("duplicate") ? "That coupon code is already in use." : error.message };
  revalidateDiscountSurfaces();
  return { ok: true as const };
}

export async function toggleDiscount(id: string, active: boolean) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("discounts").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidateDiscountSurfaces();
  return { ok: true as const };
}

export async function deleteDiscount(id: string) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("discounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateDiscountSurfaces();
  return { ok: true as const };
}

function revalidateDiscountSurfaces() {
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/pos");
  revalidatePath("/shop");
}
