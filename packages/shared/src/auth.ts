import "server-only";
import { createClient } from "./supabase/server";

/** Staff role. Lives here (shared) so both apps can use it without reaching into
 *  an admin-only component; the admin nav re-exports it for existing importers. */
export type Role = "owner" | "manager" | "cashier";

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
