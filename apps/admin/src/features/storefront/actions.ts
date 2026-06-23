"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@hamza/shared/supabase/admin";
import { getCurrentUser } from "@hamza/shared/auth";

export async function updateListing(
  id: string,
  patch: { is_published?: boolean; online_price?: number },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "manager")) return { error: "Not authorized." };
  const db = createAdminClient();
  const { error } = await db.from("store_listings").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/storefront");
  return { ok: true };
}
