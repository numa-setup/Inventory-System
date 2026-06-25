// ------------------------------------------------------------------
// One-off data correction: fix historical returns that refunded the
// PRE-DISCOUNT price instead of the net amount actually paid.
//
//   node scripts/fix-return-refunds.mjs            # dry-run (default) — shows what would change
//   node scripts/fix-return-refunds.mjs --apply    # apply the corrections (transactional)
//
// Background: returns used to refund qty x unit_price (list price), ignoring the
// line discount and the line's proportional share of any bill-level discount.
// That made e.g. INV-64660784 refund Rs 600 for a Rs 550 sale, pushing net sales
// to -Rs 50. The code is fixed; this corrects the rows already written.
//
// For each return it recomputes the correct refund:
//   netUnitPaid(line) = (sale_item.line_total / sale_item.qty) * (sale.total / Σ line_total)
//   refund(line)      = round2(returned_qty * netUnitPaid)
// then, only where the stored amount differs, it corrects:
//   - sale_return_items.line_total  -> correct per-line refund
//   - sale_returns.total            -> Σ corrected lines
//   - the refund settlement:
//       * cash-like: the matching negative payments row (amount == -old total) -> -new total
//       * UDHAAR:    the customer_ledger PAYMENT (reference 'Return <no>') + customers.credit_balance
// It NEVER deletes data and NEVER touches stock moves (the returned quantity is
// correct). Idempotent: re-running finds nothing once corrected.
// ------------------------------------------------------------------
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!REF || !PASSWORD) { console.error("Missing SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD in .env.local"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const round2 = (n) => Math.round(n * 100) / 100;

const REGIONS = ["ap-south-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","us-east-1","us-east-2","us-west-1","us-west-2","eu-central-1","eu-west-1","eu-west-2","eu-west-3","eu-north-1","ca-central-1","sa-east-1"];
const PREFIXES = ["aws-1","aws-0"];
async function connect() {
  for (const region of REGIONS) for (const prefix of PREFIXES) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const client = new pg.Client({ host, port: 5432, user: `postgres.${REF}`, password: PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await client.connect(); console.log(`✓ Connected via ${host}`); return client; } catch { await client.end().catch(()=>{}); }
  }
  throw new Error("Could not connect to any Supabase pooler region.");
}

const c = await connect();
console.log(APPLY ? "\n→ APPLYING corrections\n" : "\n→ DRY RUN (no changes). Re-run with --apply to commit.\n");

const { rows: returns } = await c.query(`
  select sr.id, sr.receipt_no, sr.sale_id, sr.total as stored_total, sr.refund_method,
         s.total as sale_total, s.customer_id
  from sale_returns sr join sales s on s.id = sr.sale_id
  order by sr.created_at`);

let fixed = 0;
for (const r of returns) {
  const saleTotal = Number(r.sale_total);
  const { rows: allItems } = await c.query(`select qty, line_total from sale_items where sale_id=$1`, [r.sale_id]);
  const sumLT = allItems.reduce((s, i) => s + Number(i.line_total), 0);

  const { rows: ri } = await c.query(`select id, sale_item_id, qty, line_total from sale_return_items where return_id=$1`, [r.id]);
  const corrections = [];
  let correctTotal = 0;
  for (const it of ri) {
    const { rows: orig } = await c.query(`select qty, line_total from sale_items where id=$1`, [it.sale_item_id]);
    const oq = Number(orig[0]?.qty ?? 0), olt = Number(orig[0]?.line_total ?? 0);
    const netUnit = (oq <= 0 || sumLT <= 0 || saleTotal <= 0) ? 0 : (olt / oq) * (saleTotal / sumLT);
    const correct = round2(Number(it.qty) * netUnit);
    correctTotal += correct;
    corrections.push({ id: it.id, stored: Number(it.line_total), correct });
  }
  correctTotal = round2(correctTotal);
  const storedTotal = Number(r.stored_total);
  if (Math.abs(correctTotal - storedTotal) <= 0.01) continue; // already correct

  fixed++;
  console.log(`FIX ${r.receipt_no} (return ${r.id})`);
  console.log(`  refund ${storedTotal} -> ${correctTotal}  (over-refunded by ${round2(storedTotal - correctTotal)}), method=${r.refund_method}`);

  if (!APPLY) {
    for (const f of corrections) if (Math.abs(f.correct - f.stored) > 0.01) console.log(`    item ${f.id}: line_total ${f.stored} -> ${f.correct}`);
    continue;
  }

  await c.query("begin");
  try {
    for (const f of corrections) {
      await c.query(`update sale_return_items set line_total=$1 where id=$2`, [f.correct, f.id]);
    }
    await c.query(`update sale_returns set total=$1 where id=$2`, [correctTotal, r.id]);

    // Correct the refund settlement so the books match the corrected refund.
    if (r.refund_method === "UDHAAR" && r.customer_id) {
      const delta = round2(storedTotal - correctTotal); // over-refunded amount
      const { rows: led } = await c.query(
        `select id, balance_after from customer_ledger
         where customer_id=$1 and type='PAYMENT' and reference=$2 and amount=$3
         order by created_at desc limit 1`,
        [r.customer_id, `Return ${r.receipt_no}`, storedTotal]);
      if (led.length) {
        await c.query(`update customer_ledger set amount=$1, balance_after=balance_after+$2 where id=$3`,
          [correctTotal, delta, led[0].id]);
        // A PAYMENT of storedTotal reduced credit_balance by storedTotal; the
        // smaller correct refund means we over-reduced — add the delta back.
        await c.query(`update customers set credit_balance=credit_balance+$1 where id=$2`, [delta, r.customer_id]);
        console.log(`    customer_ledger ${led[0].id}: ${storedTotal} -> ${correctTotal}; credit_balance += ${delta}`);
      } else {
        console.log(`    ! no matching UDHAAR ledger row found — left settlement untouched, review manually`);
      }
    } else {
      // cash-like: the negative payment created for this refund (amount == -storedTotal, same method).
      const { rows: pays } = await c.query(
        `select id, amount from payments where sale_id=$1 and method=$2 and amount<0 and abs(amount + $3) < 0.01
         order by created_at desc limit 1`,
        [r.sale_id, r.refund_method, storedTotal]);
      if (pays.length) {
        await c.query(`update payments set amount=$1 where id=$2`, [-correctTotal, pays[0].id]);
        console.log(`    payments ${pays[0].id}: ${pays[0].amount} -> ${-correctTotal}`);
      } else {
        console.log(`    ! no matching negative payment found — left settlement untouched, review manually`);
      }
    }
    await c.query("commit");
    console.log(`  ✓ committed`);
  } catch (e) {
    await c.query("rollback").catch(()=>{});
    console.error(`  ✗ rolled back: ${e.message}`);
  }
}

console.log(`\n${APPLY ? "Corrected" : "Would correct"} ${fixed} return(s) of ${returns.length}.`);
await c.end();
