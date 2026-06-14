import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SettingsClient, type SettingsData, type UserRow } from "@/features/settings/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const me = await getCurrentUser();

  const [{ data: settings }, { data: users }] = await Promise.all([
    supabase.from("settings").select("store_name, costing_method, tax_percent, currency").eq("id", 1).single(),
    supabase.from("profiles").select("id, full_name, role, active").order("role"),
  ]);

  const data: SettingsData = {
    store_name: settings?.store_name ?? "Hamza General Store",
    costing_method: (settings?.costing_method as "WEIGHTED_AVERAGE" | "FIFO") ?? "WEIGHTED_AVERAGE",
    tax_percent: Number(settings?.tax_percent ?? 0),
    currency: settings?.currency ?? "PKR",
  };

  const userRows: UserRow[] = (users ?? []).map((u) => ({
    id: u.id, full_name: u.full_name, role: u.role, active: u.active,
  }));

  return <SettingsClient data={data} users={userRows} isOwner={me?.role === "owner"} myId={me?.id ?? ""} />;
}
