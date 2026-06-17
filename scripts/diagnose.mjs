// One-off performance diagnostic. Connects via the same pooler logic as migrate.mjs
// and reports row counts, hot-path indexes, and EXPLAIN ANALYZE on the scan/idempotency paths.
//   node scripts/diagnose.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REGIONS = ["ap-south-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","us-east-1","us-east-2","us-west-1","us-west-2","eu-central-1","eu-west-1","eu-west-2","eu-west-3","eu-north-1","ca-central-1","sa-east-1"];
const PREFIXES = ["aws-1", "aws-0"];

async function connect() {
  for (const region of REGIONS) for (const prefix of PREFIXES) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const client = new pg.Client({ host, port: 5432, user: `postgres.${REF}`, password: PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await client.connect(); console.log(`✓ Connected via ${host}\n`); return client; }
    catch { await client.end().catch(() => {}); }
  }
  throw new Error("Could not connect.");
}

async function main() {
  const c = await connect();
  const q = (sql, p) => c.query(sql, p);

  console.log("=== ROW COUNTS ===");
  const tables = ["products","product_variants","product_barcodes","stock_moves","stock_levels","sales","sale_items","customers","orders","categories","product_option_values","variant_option_values"];
  for (const t of tables) {
    try { const { rows } = await q(`select count(*)::int n from ${t}`); console.log(`  ${t.padEnd(24)} ${rows[0].n}`); }
    catch (e) { console.log(`  ${t.padEnd(24)} (err: ${e.message})`); }
  }

  console.log("\n=== INDEXES on hot tables ===");
  const { rows: idx } = await q(`
    select tablename, indexname, indexdef from pg_indexes
    where schemaname='public' and tablename in ('product_barcodes','stock_moves','products','product_variants','sales','sale_items')
    order by tablename, indexname`);
  for (const r of idx) console.log(`  ${r.tablename}.${r.indexname}: ${r.indexdef.replace(/.*USING /,'USING ')}`);

  const explain = async (label, sql) => {
    console.log(`\n=== EXPLAIN ANALYZE: ${label} ===`);
    try { const { rows } = await q(`explain (analyze, buffers, format text) ${sql}`); for (const r of rows) console.log("  " + r["QUERY PLAN"]); }
    catch (e) { console.log("  err: " + e.message); }
  };

  // representative barcode to probe (real one if present)
  const { rows: bc } = await q(`select barcode from product_barcodes where barcode is not null limit 1`);
  const sample = bc[0]?.barcode ?? "0000000000000";
  await explain("barcode lookup (scan hot path)", `select variant_id, product_id from product_barcodes where barcode = '${sample}'`);
  await explain("idempotency dedup (POS hot path)", `select reference_id from stock_moves where idempotency_key = 'nonexistent-key-0'`);
  await explain("variant_availability (full view)", `select * from variant_availability`);

  await c.end();
  console.log("\n✓ done");
}
main().catch((e) => { console.error(e); process.exit(1); });
