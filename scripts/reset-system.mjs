// ------------------------------------------------------------------
// One-off: wipe ALL business data + fix roles for a fresh, empty system.
//
//   node scripts/reset-system.mjs
//
// DATA-ONLY. Does NOT touch schema, features, settings, storage buckets, or
// migrations. KEEPS: settings, locations, profiles (the single owner), auth
// setup, _schema_migrations, auth_codes.
//
// What it does:
//   1. TRUNCATE every business table (products, sales, orders, stock, customers,
//      suppliers, purchasing, discounts, notifications, audit_log, …) with
//      RESTART IDENTITY CASCADE — leaves a clean, empty system (no orphan stock).
//   2. Ensure the ADMIN_EMAIL account is the sole active OWNER.
//   3. If REMOVE_USER_EMAIL is set, remove that account entirely: delete its
//      profile row, then its auth user via the service-role admin API (also
//      clears identities/sessions).
//
// Reads pg creds from ../.env.local and the service-role key from
// ../apps/admin/.env.local (both git-ignored). No secrets are hardcoded.
// ------------------------------------------------------------------
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", "apps", "admin", ".env.local") });

const REF = process.env.SUPABASE_PROJECT_REF;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Emails are read from env (never hardcoded/committed):
//   ADMIN_EMAIL        — the account to keep as the sole active owner
//   REMOVE_USER_EMAIL  — (optional) an account to remove entirely
const OWNER_EMAIL = process.env.ADMIN_EMAIL;
const REMOVE_EMAIL = process.env.REMOVE_USER_EMAIL;

if (!REF || !DB_PASSWORD) { console.error("Missing SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD in .env.local"); process.exit(1); }
if (!SUPA_URL || !SERVICE_KEY) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.local"); process.exit(1); }
if (!OWNER_EMAIL) { console.error("Set ADMIN_EMAIL in apps/admin/.env.local (the account to keep as owner)."); process.exit(1); }

// Business tables to wipe. Everything NOT here is kept (settings, locations,
// profiles, auth_codes, _schema_migrations). CASCADE handles any child rows.
const BUSINESS_TABLES = [
  // catalogue
  "products", "product_variants", "product_options", "product_option_values",
  "variant_option_values", "product_barcodes", "product_units", "store_listings",
  "categories", "collections", "collection_products", "homepage_sections", "banners",
  // people
  "customers", "customer_ledger", "suppliers", "supplier_ledger",
  // purchasing / inventory
  "purchase_orders", "purchase_order_items", "goods_receipts", "goods_receipt_items",
  "lots", "stock_moves", "stock_levels", "reservations",
  // sales / orders / payments
  "sales", "sale_items", "sale_returns", "sale_return_items", "payments",
  "orders", "order_items", "shipments",
  // promotions / activity
  "discounts", "discount_redemptions", "notifications", "audit_log",
];

const REGIONS = ["ap-south-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","us-east-1","us-east-2","us-west-1","us-west-2","eu-central-1","eu-west-1","eu-west-2","eu-west-3","eu-north-1","ca-central-1","sa-east-1"];
const PREFIXES = ["aws-1","aws-0"];
async function connect() {
  for (const region of REGIONS) for (const prefix of PREFIXES) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const client = new pg.Client({ host, port: 5432, user: `postgres.${REF}`, password: DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await client.connect(); console.log(`✓ Connected via ${host}`); return client; } catch { await client.end().catch(()=>{}); }
  }
  throw new Error("Could not connect to any Supabase pooler region.");
}

const client = await connect();

// Keep only tables that actually exist (defensive against schema drift).
const { rows: existing } = await client.query(
  `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
);
const present = new Set(existing.map((r) => r.table_name));
const targets = BUSINESS_TABLES.filter((t) => present.has(t));
const missing = BUSINESS_TABLES.filter((t) => !present.has(t));
if (missing.length) console.log("• not present, skipped:", missing.join(", "));

// 1) Wipe business data.
const list = targets.map((t) => `public."${t}"`).join(", ");
console.log(`\n→ Truncating ${targets.length} business tables …`);
await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE;`);
console.log("✓ Business data cleared.");

// 2) Ensure the correct sole owner.
const up = await client.query(
  `update public.profiles p set role='owner', active=true
     from auth.users u where u.id=p.id and lower(u.email)=lower($1)`,
  [OWNER_EMAIL],
);
console.log(`✓ ${OWNER_EMAIL} set to active owner (${up.rowCount} row).`);

// 3) Remove the old user (only if REMOVE_USER_EMAIL is set). Profile row first
//    (FK refs already gone after wipe), then the auth user via the admin API.
const { rows: toRemove } = REMOVE_EMAIL
  ? await client.query(`select u.id from auth.users u where lower(u.email)=lower($1)`, [REMOVE_EMAIL])
  : { rows: [] };
if (!REMOVE_EMAIL) {
  console.log("• REMOVE_USER_EMAIL not set — skipping user removal.");
} else if (toRemove.length) {
  const removeId = toRemove[0].id;
  await client.query(`delete from public.profiles where id=$1`, [removeId]);
  const supa = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await supa.auth.admin.deleteUser(removeId);
  if (error) {
    console.error(`! Could not delete auth user ${REMOVE_EMAIL}: ${error.message}`);
    console.error("  Profile row removed; delete the auth user manually in Supabase → Authentication → Users.");
  } else {
    console.log(`✓ Removed ${REMOVE_EMAIL} (profile + auth user).`);
  }
} else {
  console.log(`• ${REMOVE_EMAIL} not found — nothing to remove.`);
}

// 4) Report remaining state.
const { rows: profs } = await client.query(
  `select coalesce(u.email,'(no email)') email, p.role, p.active from public.profiles p left join auth.users u on u.id=p.id order by u.email`,
);
console.log("\n=== Remaining profiles ===");
for (const r of profs) console.log(`${r.email}  role=${r.role} active=${r.active}`);

await client.end();
console.log("\n✓ Done. Fresh, empty system with a single owner.");
