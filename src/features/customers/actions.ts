"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function createCustomer(input: {
  name: string;
  phone?: string | null;
  address?: string | null;
  credit_limit?: number;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  if (!input.name.trim()) return { error: "Name is required." };
  const db = createAdminClient();
  const { error } = await db.from("customers").insert({
    name: input.name.trim(),
    phone: input.phone || null,
    address: input.address || null,
    credit_limit: input.credit_limit ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/customers");
  return { ok: true };
}

/** Record a repayment (reduces what the customer owes). */
export async function recordPayment(input: { customer_id: string; amount: number; note?: string }) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  if (!input.amount || input.amount <= 0) return { error: "Enter a valid amount." };
  const db = createAdminClient();

  const { data: cust, error: cErr } = await db
    .from("customers").select("credit_balance").eq("id", input.customer_id).single();
  if (cErr) return { error: cErr.message };

  const newBalance = Number(cust.credit_balance) - input.amount;
  const { error: lErr } = await db.from("customer_ledger").insert({
    customer_id: input.customer_id,
    type: "PAYMENT",
    amount: input.amount,
    reference: input.note || "Repayment",
    balance_after: newBalance,
    created_by: user.id,
  });
  if (lErr) return { error: lErr.message };

  await db.from("customers").update({ credit_balance: newBalance }).eq("id", input.customer_id);
  revalidatePath("/admin/customers");
  return { ok: true, balance: newBalance };
}
