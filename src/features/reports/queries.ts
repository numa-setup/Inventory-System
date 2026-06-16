import type { createClient } from "@/lib/supabase/server";
import type { Accent } from "@/components/ui/accent";
import type { DimensionFilter } from "@/components/ui/FilterBar";
import { getVariantOptions } from "@/lib/catalog";
import { formatPKR, formatNumber } from "@/lib/utils";
import { bucketKey, bucketOf, type DateRange } from "@/lib/dates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ColKind = "text" | "pkr" | "num" | "pct" | "pill";
export interface ReportColumn { key: string; header: string; align?: "left" | "right"; kind?: ColKind }
export interface ReportChart {
  type: "area" | "bar" | "donut";
  title?: string;
  data: Record<string, unknown>[];
  dataKey?: string;
  xKey?: string;
  accent?: Accent;
  centerLabel?: string;
  centerValue?: string;
}
export interface ReportData {
  key: string;
  title: string;
  subtitle?: string;
  kpis: { label: string; value: string; accent: Accent }[];
  charts: ReportChart[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  dimensions: DimensionFilter[];
}

export const REPORTS: { key: string; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "profit", label: "Profit & Margin" },
  { key: "inventory", label: "Inventory Valuation" },
  { key: "products", label: "Product Performance" },
  { key: "purchases", label: "Purchases & Suppliers" },
  { key: "customers", label: "Customers & Udhaar" },
  { key: "users", label: "Staff Activity" },
  { key: "system", label: "Full System" },
];

const iso = (d: Date) => d.toISOString();

/** Build a trend series (label + value) bucketed across the range. */
function trend(range: DateRange, rows: { created_at: string; value: number }[], accent: Accent, dataKey = "value"): ReportChart {
  const b = bucketOf(range);
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = bucketKey(new Date(r.created_at), b);
    map.set(k, (map.get(k) ?? 0) + r.value);
  }
  return { type: "area", data: [...map.entries()].map(([label, v]) => ({ label, [dataKey]: Math.round(v) })), dataKey, accent };
}

export async function buildReport(supabase: Supabase, key: string, range: DateRange, params: URLSearchParams): Promise<ReportData> {
  switch (key) {
    case "profit": return profitReport(supabase, range);
    case "inventory": return inventoryReport(supabase, range);
    case "products": return productsReport(supabase, range, params);
    case "purchases": return purchasesReport(supabase, range);
    case "customers": return customersReport(supabase, range);
    case "users": return usersReport(supabase, range);
    case "system": return systemReport(supabase, range);
    case "sales":
    default: return salesReport(supabase, range, params);
  }
}

/* ---------------- shared fetch ---------------- */
async function fetchSales(supabase: Supabase, range: DateRange) {
  const { data: sales } = await supabase
    .from("sales")
    .select("id, total, discount, tax, cogs_total, profit, created_at, cashier_id, customer_id")
    .gte("created_at", iso(range.from)).lte("created_at", iso(range.to));
  const ids = (sales ?? []).map((s) => s.id);
  const { data: items } = ids.length
    ? await supabase.from("sale_items").select("sale_id, variant_id, product_id, qty, unit_price, unit_cogs, line_total").in("sale_id", ids)
    : { data: [] as Record<string, unknown>[] };
  return { sales: sales ?? [], items: (items ?? []) as Record<string, unknown>[] };
}

/* ---------------- 1. Sales ---------------- */
async function salesReport(supabase: Supabase, range: DateRange, params: URLSearchParams): Promise<ReportData> {
  const groupBy = params.get("view") ?? "day";
  const { sales, items } = await fetchSales(supabase, range);
  const variants = await getVariantOptions(supabase);
  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const catName = await categoryNames(supabase);

  const totalSales = sales.reduce((s, x) => s + Number(x.total), 0);
  const totalProfit = sales.reduce((s, x) => s + Number(x.profit), 0);
  const count = sales.length;

  const chart = trend(range, sales.map((s) => ({ created_at: s.created_at, value: Number(s.total) })), "blue", "sales");

  let columns: ReportColumn[]; let rows: Record<string, unknown>[];
  if (groupBy === "product" || groupBy === "category") {
    const agg = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    for (const it of items) {
      const v = vMap.get(it.variant_id as string);
      const k = groupBy === "category" ? (v?.category_id ?? "—") : (it.variant_id as string);
      const name = groupBy === "category" ? (v?.category_id ? (catName.get(v.category_id) ?? "—") : "Uncategorised") : (v ? `${v.product_name} · ${v.label}` : "—");
      const cur = agg.get(k) ?? { name, qty: 0, revenue: 0, profit: 0 };
      cur.qty += Number(it.qty); cur.revenue += Number(it.line_total);
      cur.profit += Number(it.line_total) - Number(it.qty) * Number(it.unit_cogs);
      agg.set(k, cur);
    }
    columns = [
      { key: "name", header: groupBy === "category" ? "Category" : "Product", kind: "text" },
      { key: "qty", header: "Units", align: "right", kind: "num" },
      { key: "revenue", header: "Revenue", align: "right", kind: "pkr" },
      { key: "profit", header: "Profit", align: "right", kind: "pkr" },
    ];
    rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue);
  } else if (groupBy === "cashier") {
    const names = await profileNames(supabase);
    const agg = new Map<string, { name: string; orders: number; sales: number; profit: number }>();
    for (const s of sales) {
      const k = s.cashier_id ?? "—";
      const cur = agg.get(k) ?? { name: s.cashier_id ? (names.get(s.cashier_id) ?? "—") : "—", orders: 0, sales: 0, profit: 0 };
      cur.orders += 1; cur.sales += Number(s.total); cur.profit += Number(s.profit);
      agg.set(k, cur);
    }
    columns = [
      { key: "name", header: "Cashier", kind: "text" }, { key: "orders", header: "Orders", align: "right", kind: "num" },
      { key: "sales", header: "Sales", align: "right", kind: "pkr" }, { key: "profit", header: "Profit", align: "right", kind: "pkr" },
    ];
    rows = [...agg.values()].sort((a, b) => b.sales - a.sales);
  } else if (groupBy === "payment") {
    const { data: pays } = sales.length
      ? await supabase.from("payments").select("method, amount, sale_id").in("sale_id", sales.map((s) => s.id))
      : { data: [] as { method: string; amount: number }[] };
    const agg = new Map<string, number>();
    for (const p of pays ?? []) agg.set(p.method, (agg.get(p.method) ?? 0) + Number(p.amount));
    columns = [{ key: "name", header: "Payment type", kind: "text" }, { key: "amount", header: "Amount", align: "right", kind: "pkr" }];
    rows = [...agg.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  } else {
    const b = bucketOf(range);
    const agg = new Map<string, { label: string; orders: number; sales: number; profit: number }>();
    for (const s of sales) {
      const k = bucketKey(new Date(s.created_at), b);
      const cur = agg.get(k) ?? { label: k, orders: 0, sales: 0, profit: 0 };
      cur.orders += 1; cur.sales += Number(s.total); cur.profit += Number(s.profit);
      agg.set(k, cur);
    }
    columns = [
      { key: "label", header: "Period", kind: "text" }, { key: "orders", header: "Orders", align: "right", kind: "num" },
      { key: "sales", header: "Sales", align: "right", kind: "pkr" }, { key: "profit", header: "Profit", align: "right", kind: "pkr" },
    ];
    rows = [...agg.values()];
  }

  return {
    key: "sales", title: "Sales Report", subtitle: range.label,
    kpis: [
      { label: "Total Sales", value: formatPKR(totalSales, { compact: true }), accent: "blue" },
      { label: "Profit", value: formatPKR(totalProfit, { compact: true }), accent: "green" },
      { label: "Transactions", value: formatNumber(count), accent: "purple" },
      { label: "Avg Basket", value: formatPKR(count ? totalSales / count : 0), accent: "teal" },
    ],
    charts: [{ ...chart, title: "Sales trend" }],
    columns, rows,
    dimensions: [{ key: "view", label: "Group by: Day", options: [
      { value: "day", label: "By day" }, { value: "product", label: "By product" },
      { value: "category", label: "By category" }, { value: "cashier", label: "By cashier" },
      { value: "payment", label: "By payment type" },
    ] }],
  };
}

/* ---------------- 2. Profit & margin ---------------- */
async function profitReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const { sales, items } = await fetchSales(supabase, range);
  const variants = await getVariantOptions(supabase);
  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
  const cogs = sales.reduce((s, x) => s + Number(x.cogs_total), 0);
  const profit = revenue - cogs;
  const margin = revenue ? (profit / revenue) * 100 : 0;

  const agg = new Map<string, { name: string; revenue: number; cogs: number; profit: number; margin: number }>();
  for (const it of items) {
    const v = vMap.get(it.variant_id as string);
    const k = it.variant_id as string;
    const rev = Number(it.line_total); const c = Number(it.qty) * Number(it.unit_cogs);
    const cur = agg.get(k) ?? { name: v ? `${v.product_name} · ${v.label}` : "—", revenue: 0, cogs: 0, profit: 0, margin: 0 };
    cur.revenue += rev; cur.cogs += c; cur.profit += rev - c;
    agg.set(k, cur);
  }
  const rows = [...agg.values()].map((r) => ({ ...r, margin: r.revenue ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit);

  return {
    key: "profit", title: "Profit & Margin", subtitle: range.label,
    kpis: [
      { label: "Revenue", value: formatPKR(revenue, { compact: true }), accent: "blue" },
      { label: "COGS", value: formatPKR(cogs, { compact: true }), accent: "amber" },
      { label: "Gross Profit", value: formatPKR(profit, { compact: true }), accent: "green" },
      { label: "Margin", value: `${margin.toFixed(1)}%`, accent: "teal" },
    ],
    charts: [{ ...trend(range, sales.map((s) => ({ created_at: s.created_at, value: Number(s.profit) })), "green", "profit"), title: "Profit trend" }],
    columns: [
      { key: "name", header: "Product", kind: "text" }, { key: "revenue", header: "Revenue", align: "right", kind: "pkr" },
      { key: "cogs", header: "COGS", align: "right", kind: "pkr" }, { key: "profit", header: "Profit", align: "right", kind: "pkr" },
      { key: "margin", header: "Margin", align: "right", kind: "pct" },
    ],
    rows, dimensions: [],
  };
}

/* ---------------- 3. Inventory valuation (point-in-time) ---------------- */
async function inventoryReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const variants = await getVariantOptions(supabase);
  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const catName = await categoryNames(supabase);

  // reconstruct on-hand as of range.to from the ledger (physical legs only)
  const { data: physLocs } = await supabase.from("locations").select("id").eq("type", "PHYSICAL");
  const physIds = new Set((physLocs ?? []).map((l) => l.id));
  const { data: moves } = await supabase
    .from("stock_moves")
    .select("variant_id, qty, from_location_id, to_location_id, created_at")
    .lte("created_at", iso(range.to));
  const onHand = new Map<string, number>();
  for (const m of moves ?? []) {
    if (physIds.has(m.to_location_id)) onHand.set(m.variant_id, (onHand.get(m.variant_id) ?? 0) + Number(m.qty));
    if (physIds.has(m.from_location_id)) onHand.set(m.variant_id, (onHand.get(m.variant_id) ?? 0) - Number(m.qty));
  }

  const byCat = new Map<string, number>();
  let totalValue = 0; let totalUnits = 0; let outCount = 0;
  const rows: Record<string, unknown>[] = [];
  for (const [vid, qty] of onHand) {
    const v = vMap.get(vid);
    if (!v) continue;
    const value = qty * v.cost;
    if (qty <= 0) outCount++;
    totalValue += value; totalUnits += qty;
    const cat = v.category_id ? (catName.get(v.category_id) ?? "—") : "Uncategorised";
    byCat.set(cat, (byCat.get(cat) ?? 0) + value);
    rows.push({ name: `${v.product_name} · ${v.label}`, category: cat, units: qty, cost: v.cost, value });
  }
  rows.sort((a, b) => (b.value as number) - (a.value as number));

  return {
    key: "inventory", title: "Inventory Valuation", subtitle: `as of ${range.label}`,
    kpis: [
      { label: "Stock Value", value: formatPKR(totalValue, { compact: true }), accent: "blue" },
      { label: "Total Units", value: formatNumber(totalUnits), accent: "teal" },
      { label: "Variants", value: formatNumber(rows.length), accent: "purple" },
      { label: "Out of stock", value: formatNumber(outCount), accent: "coral" },
    ],
    charts: [{
      type: "donut", title: "Value by category",
      data: [...byCat.entries()].map(([name, value]) => ({ name, value: Math.round(value) })),
      centerLabel: "Total", centerValue: formatPKR(totalValue, { compact: true }),
    }],
    columns: [
      { key: "name", header: "Variant", kind: "text" }, { key: "category", header: "Category", kind: "text" },
      { key: "units", header: "On hand", align: "right", kind: "num" }, { key: "cost", header: "Avg cost", align: "right", kind: "pkr" },
      { key: "value", header: "Value", align: "right", kind: "pkr" },
    ],
    rows: rows.slice(0, 100), dimensions: [],
  };
}

/* ---------------- 4. Product performance ---------------- */
async function productsReport(supabase: Supabase, range: DateRange, params: URLSearchParams): Promise<ReportData> {
  const view = params.get("view") ?? "best";
  const { items } = await fetchSales(supabase, range);
  const variants = await getVariantOptions(supabase);
  const { data: avail } = await supabase.from("variant_availability").select("variant_id, on_hand");
  const availMap = new Map((avail ?? []).map((a) => [a.variant_id, Number(a.on_hand)]));

  const sold = new Map<string, { qty: number; revenue: number; profit: number }>();
  for (const it of items) {
    const k = it.variant_id as string;
    const cur = sold.get(k) ?? { qty: 0, revenue: 0, profit: 0 };
    cur.qty += Number(it.qty); cur.revenue += Number(it.line_total);
    cur.profit += Number(it.line_total) - Number(it.qty) * Number(it.unit_cogs);
    sold.set(k, cur);
  }

  let all = variants.map((v) => {
    const s = sold.get(v.variant_id) ?? { qty: 0, revenue: 0, profit: 0 };
    return { name: `${v.product_name} · ${v.label}`, sku: v.sku, qty: s.qty, revenue: s.revenue, profit: s.profit, on_hand: availMap.get(v.variant_id) ?? 0 };
  });

  if (view === "dead") all = all.filter((r) => r.qty === 0 && r.on_hand > 0).sort((a, b) => b.on_hand - a.on_hand);
  else if (view === "slow") all = all.filter((r) => r.on_hand > 0).sort((a, b) => a.qty - b.qty);
  else all = all.filter((r) => r.qty > 0).sort((a, b) => b.revenue - a.revenue);

  const bestForChart = [...all].filter((r) => r.revenue > 0).slice(0, 10).map((r) => ({ label: r.name.split(" · ")[0].slice(0, 14), revenue: Math.round(r.revenue) }));

  return {
    key: "products", title: "Product Performance", subtitle: range.label,
    kpis: [
      { label: "Variants sold", value: formatNumber([...sold.values()].filter((s) => s.qty > 0).length), accent: "blue" },
      { label: "Dead stock", value: formatNumber(variants.filter((v) => !(sold.get(v.variant_id)?.qty) && (availMap.get(v.variant_id) ?? 0) > 0).length), accent: "coral" },
      { label: "Units sold", value: formatNumber([...sold.values()].reduce((s, x) => s + x.qty, 0)), accent: "teal" },
      { label: "Revenue", value: formatPKR([...sold.values()].reduce((s, x) => s + x.revenue, 0), { compact: true }), accent: "green" },
    ],
    charts: [{ type: "bar", title: "Top sellers by revenue", data: bestForChart, dataKey: "revenue", accent: "blue" }],
    columns: [
      { key: "name", header: "Variant", kind: "text" }, { key: "qty", header: "Sold", align: "right", kind: "num" },
      { key: "revenue", header: "Revenue", align: "right", kind: "pkr" }, { key: "profit", header: "Profit", align: "right", kind: "pkr" },
      { key: "on_hand", header: "On hand", align: "right", kind: "num" },
    ],
    rows: all.slice(0, 100),
    dimensions: [{ key: "view", label: "View: Best sellers", options: [
      { value: "best", label: "Best sellers" }, { value: "slow", label: "Slow movers" }, { value: "dead", label: "Dead stock" },
    ] }],
  };
}

/* ---------------- 5. Purchases & suppliers ---------------- */
async function purchasesReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const { data: receipts } = await supabase
    .from("goods_receipts").select("supplier_id, total, created_at")
    .gte("created_at", iso(range.from)).lte("created_at", iso(range.to));
  const { data: suppliers } = await supabase.from("suppliers").select("id, name, balance");
  const supName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const spendBy = new Map<string, number>();
  let totalSpend = 0;
  for (const r of receipts ?? []) {
    totalSpend += Number(r.total);
    const k = r.supplier_id ?? "—";
    spendBy.set(k, (spendBy.get(k) ?? 0) + Number(r.total));
  }
  const totalPayable = (suppliers ?? []).reduce((s, x) => s + Math.max(Number(x.balance), 0), 0);

  const rows = (suppliers ?? []).map((s) => ({
    name: s.name, spend: spendBy.get(s.id) ?? 0, payable: Number(s.balance),
  })).sort((a, b) => b.spend - a.spend);

  return {
    key: "purchases", title: "Purchases & Suppliers", subtitle: range.label,
    kpis: [
      { label: "Spend (period)", value: formatPKR(totalSpend, { compact: true }), accent: "blue" },
      { label: "Receipts", value: formatNumber((receipts ?? []).length), accent: "purple" },
      { label: "Total Payable", value: formatPKR(totalPayable, { compact: true }), accent: "coral" },
      { label: "Suppliers", value: formatNumber((suppliers ?? []).length), accent: "teal" },
    ],
    charts: [{ type: "bar", title: "Spend by supplier", accent: "blue", dataKey: "spend",
      data: rows.filter((r) => r.spend > 0).slice(0, 10).map((r) => ({ label: r.name.slice(0, 14), spend: Math.round(r.spend) })) }],
    columns: [
      { key: "name", header: "Supplier", kind: "text" }, { key: "spend", header: "Spend (period)", align: "right", kind: "pkr" },
      { key: "payable", header: "Payable", align: "right", kind: "pkr" },
    ],
    rows, dimensions: [],
  };
}

/* ---------------- 6. Customers & udhaar ---------------- */
async function customersReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const { sales } = await fetchSales(supabase, range);
  const { data: customers } = await supabase.from("customers").select("id, name, credit_balance");
  const { data: ledger } = await supabase.from("customer_ledger").select("customer_id, type, created_at").eq("type", "CHARGE");

  const salesBy = new Map<string, { amount: number; orders: number }>();
  for (const s of sales) {
    if (!s.customer_id) continue;
    const cur = salesBy.get(s.customer_id) ?? { amount: 0, orders: 0 };
    cur.amount += Number(s.total); cur.orders += 1;
    salesBy.set(s.customer_id, cur);
  }
  // oldest charge per customer (rough aging)
  const oldestCharge = new Map<string, number>();
  for (const l of ledger ?? []) {
    const t = new Date(l.created_at).getTime();
    oldestCharge.set(l.customer_id, Math.min(oldestCharge.get(l.customer_id) ?? t, t));
  }
  const ageBucket = (id: string, bal: number) => {
    if (bal <= 0) return "—";
    const days = oldestCharge.has(id) ? (Date.now() - (oldestCharge.get(id) as number)) / 86_400_000 : 0;
    return days <= 30 ? "0–30d" : days <= 60 ? "31–60d" : days <= 90 ? "61–90d" : "90d+";
  };

  const totalOutstanding = (customers ?? []).reduce((s, c) => s + Math.max(Number(c.credit_balance), 0), 0);
  const rows = (customers ?? []).map((c) => ({
    name: c.name, sales: salesBy.get(c.id)?.amount ?? 0, orders: salesBy.get(c.id)?.orders ?? 0,
    outstanding: Number(c.credit_balance), aging: ageBucket(c.id, Number(c.credit_balance)),
  })).sort((a, b) => b.outstanding - a.outstanding || b.sales - a.sales);

  return {
    key: "customers", title: "Customers & Udhaar", subtitle: range.label,
    kpis: [
      { label: "Outstanding Udhaar", value: formatPKR(totalOutstanding, { compact: true }), accent: "coral" },
      { label: "On Khata", value: formatNumber((customers ?? []).filter((c) => Number(c.credit_balance) > 0).length), accent: "amber" },
      { label: "Sales (period)", value: formatPKR(sales.reduce((s, x) => s + Number(x.total), 0), { compact: true }), accent: "blue" },
      { label: "Customers", value: formatNumber((customers ?? []).length), accent: "teal" },
    ],
    charts: [{ type: "bar", title: "Top customers by sales", accent: "teal", dataKey: "sales",
      data: rows.filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 10).map((r) => ({ label: r.name.slice(0, 14), sales: Math.round(r.sales) })) }],
    columns: [
      { key: "name", header: "Customer", kind: "text" }, { key: "sales", header: "Sales (period)", align: "right", kind: "pkr" },
      { key: "outstanding", header: "Outstanding", align: "right", kind: "pkr" }, { key: "aging", header: "Aging", kind: "pill" },
    ],
    rows, dimensions: [],
  };
}

/* ---------------- 7. Staff activity ---------------- */
async function usersReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const { sales } = await fetchSales(supabase, range);
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, role");
  const { data: audit } = await supabase
    .from("audit_log").select("actor, action, created_at")
    .gte("created_at", iso(range.from)).lte("created_at", iso(range.to));

  const stat = new Map<string, { name: string; role: string; orders: number; sales: number; adjustments: number; actions: number }>();
  const ensure = (id: string) => {
    if (!stat.has(id)) {
      const p = (profiles ?? []).find((x) => x.id === id);
      stat.set(id, { name: p?.full_name ?? "—", role: p?.role ?? "—", orders: 0, sales: 0, adjustments: 0, actions: 0 });
    }
    return stat.get(id)!;
  };
  for (const s of sales) if (s.cashier_id) { const r = ensure(s.cashier_id); r.orders += 1; r.sales += Number(s.total); }
  for (const a of audit ?? []) if (a.actor) {
    const r = ensure(a.actor); r.actions += 1;
    if (a.action === "stock_adjustment" || a.action === "cycle_count") r.adjustments += 1;
  }

  return {
    key: "users", title: "Staff Activity", subtitle: range.label,
    kpis: [
      { label: "Active Staff", value: formatNumber(stat.size), accent: "blue" },
      { label: "Orders Handled", value: formatNumber(sales.length), accent: "purple" },
      { label: "Adjustments", value: formatNumber([...stat.values()].reduce((s, x) => s + x.adjustments, 0)), accent: "amber" },
      { label: "Logged Actions", value: formatNumber((audit ?? []).length), accent: "teal" },
    ],
    charts: [{ type: "bar", title: "Sales by cashier", accent: "blue", dataKey: "sales",
      data: [...stat.values()].filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).map((r) => ({ label: r.name.slice(0, 12), sales: Math.round(r.sales) })) }],
    columns: [
      { key: "name", header: "User", kind: "text" }, { key: "role", header: "Role", kind: "pill" },
      { key: "orders", header: "Orders", align: "right", kind: "num" }, { key: "sales", header: "Sales", align: "right", kind: "pkr" },
      { key: "adjustments", header: "Adjustments", align: "right", kind: "num" }, { key: "actions", header: "Actions", align: "right", kind: "num" },
    ],
    rows: [...stat.values()].sort((a, b) => b.sales - a.sales), dimensions: [],
  };
}

/* ---------------- 8. Full system ---------------- */
async function systemReport(supabase: Supabase, range: DateRange): Promise<ReportData> {
  const { sales, items } = await fetchSales(supabase, range);
  const variants = await getVariantOptions(supabase);
  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const catName = await categoryNames(supabase);
  const [{ data: avail }, { data: suppliers }, { data: customers }, { count: orderCount }] = await Promise.all([
    supabase.from("variant_availability").select("variant_id, on_hand"),
    supabase.from("suppliers").select("balance"),
    supabase.from("customers").select("credit_balance"),
    supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", iso(range.from)).lte("created_at", iso(range.to)),
  ]);

  const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
  const profit = sales.reduce((s, x) => s + Number(x.profit), 0);
  const stockValue = (avail ?? []).reduce((s, a) => { const v = vMap.get(a.variant_id); return s + Number(a.on_hand) * (v?.cost ?? 0); }, 0);
  const payables = (suppliers ?? []).reduce((s, x) => s + Math.max(Number(x.balance), 0), 0);
  const udhaar = (customers ?? []).reduce((s, x) => s + Math.max(Number(x.credit_balance), 0), 0);

  const byCat = new Map<string, number>();
  for (const it of items) {
    const v = vMap.get(it.variant_id as string);
    const cat = v?.category_id ? (catName.get(v.category_id) ?? "—") : "Uncategorised";
    byCat.set(cat, (byCat.get(cat) ?? 0) + Number(it.line_total));
  }

  const b = bucketOf(range);
  const dayAgg = new Map<string, { label: string; sales: number; profit: number }>();
  for (const s of sales) {
    const k = bucketKey(new Date(s.created_at), b);
    const cur = dayAgg.get(k) ?? { label: k, sales: 0, profit: 0 };
    cur.sales += Number(s.total); cur.profit += Number(s.profit);
    dayAgg.set(k, cur);
  }

  return {
    key: "system", title: "Full System Report", subtitle: range.label,
    kpis: [
      { label: "Sales", value: formatPKR(revenue, { compact: true }), accent: "blue" },
      { label: "Profit", value: formatPKR(profit, { compact: true }), accent: "green" },
      { label: "Online Orders", value: formatNumber(orderCount ?? 0), accent: "purple" },
      { label: "Stock Value", value: formatPKR(stockValue, { compact: true }), accent: "teal" },
      { label: "Payables", value: formatPKR(payables, { compact: true }), accent: "coral" },
      { label: "Udhaar", value: formatPKR(udhaar, { compact: true }), accent: "amber" },
    ],
    charts: [
      { ...trend(range, sales.map((s) => ({ created_at: s.created_at, value: Number(s.total) })), "blue", "sales"), title: "Sales trend" },
      { type: "donut", title: "Sales by category", data: [...byCat.entries()].map(([name, value]) => ({ name, value: Math.round(value) })) },
    ],
    columns: [
      { key: "label", header: "Period", kind: "text" }, { key: "sales", header: "Sales", align: "right", kind: "pkr" },
      { key: "profit", header: "Profit", align: "right", kind: "pkr" },
    ],
    rows: [...dayAgg.values()], dimensions: [],
  };
}

/* ---------------- helpers ---------------- */
async function categoryNames(supabase: Supabase) {
  const { data } = await supabase.from("categories").select("id, name");
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}
async function profileNames(supabase: Supabase) {
  const { data } = await supabase.from("profiles").select("id, full_name");
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}
