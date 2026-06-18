import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import type { Role } from "@/components/layout/nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Profile may not exist yet (before schema/seed). Fall back gracefully.
  let role: Role = "owner";
  let fullName = user.email?.split("@")[0] ?? "User";

  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();
    const profile = data as { full_name?: string; role?: Role } | null;
    if (profile) {
      role = profile.role ?? role;
      fullName = profile.full_name ?? fullName;
    }
  } catch {
    // profiles table not migrated yet — use fallbacks
  }

  let unread = 0;
  try {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_type", "ADMIN")
      .is("read_at", null);
    unread = count ?? 0;
  } catch {
    // notifications not readable yet — leave at 0
  }

  return (
    <AppShell role={role} userName={fullName} unreadCount={unread}>
      {children}
    </AppShell>
  );
}
