"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export interface AdminNotification {
  id: string;
  event: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  order_no: string | null;
}

/** Recent in-app alerts for staff (new orders, etc.). */
export async function getAdminNotifications(limit = 15): Promise<AdminNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("notifications")
    .select("id, event, title, body, read_at, created_at, payload, channel")
    .eq("recipient_type", "ADMIN")
    .eq("channel", "INAPP")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id as string,
    event: n.event as string,
    title: n.title as string,
    body: (n.body as string) ?? null,
    read_at: (n.read_at as string) ?? null,
    created_at: n.created_at as string,
    order_no: ((n.payload as Record<string, unknown> | null)?.order_no as string) ?? null,
  }));
}

/** Mark the given alerts read (or all unread ADMIN alerts when no ids given). */
export async function markNotificationsRead(ids?: string[]) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const db = createAdminClient();
  let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_type", "ADMIN").is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return { error: error.message };
  return { ok: true as const };
}
