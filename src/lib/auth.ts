import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/components/layout/nav";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

/** Resolve the signed-in user + profile role for server components/actions. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let role: Role = "owner";
  let fullName = user.email?.split("@")[0] ?? "User";
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

  return { id: user.id, email: user.email ?? "", fullName, role };
}
