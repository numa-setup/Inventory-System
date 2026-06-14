// Creates (or updates) the owner login via the Supabase Admin API.
// Uses the REST endpoint, so no DB networking/region is needed.
//
//   node scripts/setup-owner.mjs <email> <password> ["Full Name"]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const [, , email, password, ...nameParts] = process.argv;
const fullName = nameParts.join(" ") || "Store Owner";

if (!email || !password) {
  console.error('Usage: node scripts/setup-owner.mjs <email> <password> ["Full Name"]');
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // Find existing user by email
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);

  let userId;
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { full_name: fullName, role: "owner" },
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ Updated existing owner: ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "owner" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ Created owner: ${email}`);
  }

  // Ensure profile reflects owner role (handle_new_user may have defaulted it)
  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, role: "owner", active: true });
  if (pErr) console.warn("Profile upsert note:", pErr.message);

  console.log("\nYou can now sign in at /login with these credentials.");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
