import { describe, it, expect } from "vitest";
import { resolveRange } from "@hamza/shared/dates";
import { formatNumber, formatPKR } from "@hamza/shared/utils";
import { buildReport } from "./queries";

const ZERO_NUM = formatNumber(0);
const ZERO_PKR = formatPKR(0, { compact: true });

// A fully-returned sale: one variant sold qty 2 for Rs 200, then all 2 returned
// (refund Rs 200). Every reports tab must net this to ~0 — matching the Sales tab.
const NOW = new Date().toISOString();
const TABLES: Record<string, unknown[]> = {
  sales: [{ id: "s1", total: 200, discount: 0, tax: 0, cogs_total: 120, profit: 80, created_at: NOW, cashier_id: "cash1", customer_id: "cust1" }],
  sale_items: [{ sale_id: "s1", variant_id: "v1", product_id: "p1", qty: 2, unit_price: 100, unit_cogs: 60, line_total: 200 }],
  sale_returns: [{ id: "r1", created_at: NOW, sales: { customer_id: "cust1", cashier_id: "cash1" } }],
  sale_return_items: [{ return_id: "r1", variant_id: "v1", qty: 2, line_total: 200, unit_cogs: 60 }],
  product_variants: [{ id: "v1", product_id: "p1", sku: "SKU1", cost: 60, sale_price: 100, is_default: true, active: true }],
  products: [{ id: "p1", name: "Test Item", brand: null, category_id: "cat1", has_variants: false, active: true }],
  product_barcodes: [],
  product_option_values: [],
  variant_option_values: [],
  variant_availability: [{ variant_id: "v1", on_hand: 5 }],
  customers: [{ id: "cust1", name: "Ali", credit_balance: 0 }],
  customer_ledger: [],
};

// Minimal chainable, thenable query builder that ignores filters and resolves to
// the canned rows for its table — enough to exercise the netting logic offline.
function makeClient(tables: Record<string, unknown[]>) {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "eq", "gte", "lte", "in", "order", "not"]) b[m] = chain;
    b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, count: rows.length, error: null });
    return b;
  };
  return { from: (table: string) => builder(tables[table] ?? []) } as never;
}

const range = resolveRange("this_year", "", "");

describe("reports net returns consistently", () => {
  it("Product Performance nets returned units/revenue to zero (Dead stock untouched)", async () => {
    const r = await buildReport(makeClient(TABLES), "products", range, new URLSearchParams());
    const kpi = (label: string) => r.kpis.find((k) => k.label === label)?.value;
    expect(kpi("Units sold")).toBe(ZERO_NUM);      // 2 sold − 2 returned
    expect(kpi("Variants sold")).toBe(ZERO_NUM);   // net qty 0 → not a net seller
    expect(kpi("Revenue")).toBe(ZERO_PKR);         // 200 − 200
    expect(kpi("Dead stock")).toBe(ZERO_NUM);      // it DID sell gross, so not dead
  });

  it("Customers & Udhaar nets the period sales to zero", async () => {
    const r = await buildReport(makeClient(TABLES), "customers", range, new URLSearchParams());
    expect(r.kpis.find((k) => k.label === "Sales (period)")?.value).toBe(ZERO_PKR);
    const ali = r.rows.find((row) => row.name === "Ali");
    expect(Math.abs(Number(ali?.sales))).toBe(0); // 200 sold − 200 returned
  });
});
