// One-off: create (or update) the initial admin user securely.
//
//   node scripts/create-admin.mjs
//
// Reads from apps/admin/.env.local (git-ignored) — NEVER pass secrets on the CLI
// or commit them:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (existing)
//   ADMIN_EMAIL      — the admin's login email
//   ADMIN_PASSWORD   — the initial password (use a strong one; change later)
//
// Idempotent: if the email already exists, its password + role are updated.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", "apps", "admin", ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !KEY) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.local"); process.exit(1); }
if (!EMAIL || !PASSWORD) { console.error("Missing ADMIN_EMAIL / ADMIN_PASSWORD in apps/admin/.env.local"); process.exit(1); }
if (PASSWORD.length < 8) { console.error("ADMIN_PASSWORD must be at least 8 characters."); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const email = EMAIL.trim().toLowerCase();

const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existing = list?.users.find((u) => (u.email ?? "").toLowerCase() === email);

let userId;
if (existing) {
  const { error } = await db.auth.admin.updateUserById(existing.id, {
    password: PASSWORD, email_confirm: true, user_metadata: { ...existing.user_metadata, role: "owner" },
  });
  if (error) { console.error("Update failed:", error.message); process.exit(1); }
  userId = existing.id;
  console.log(`Updated existing admin: ${email}`);
} else {
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { role: "owner", full_name: email.split("@")[0] },
  });
  if (error) { console.error("Create failed:", error.message); process.exit(1); }
  userId = data.user.id;
  console.log(`Created admin: ${email}`);
}

// Ensure the profile is an active owner (the auth trigger seeds it from metadata,
// but make it explicit + idempotent).
const { error: pErr } = await db.from("profiles").update({ role: "owner", active: true }).eq("id", userId);
if (pErr) console.warn("Profile role update warning:", pErr.message);

console.log("Done. This admin can now sign in (email + password, then the emailed OTP).");
