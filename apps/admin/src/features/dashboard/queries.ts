import type { createClient } from "@hamza/shared/supabase/server";
import { getVariantOptions } from "@/lib/catalog";
import { bucketKey, bucketOf, type DateRange } from "@hamza/shared/dates";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const iso = (d: Date) => d.toISOString();

export interface DashboardData {
  kpis: { sales: number; profit: number; orders: number; lowStock: number; udhaar: number; stockValue: number };
  trend: { label: string; sales: number; profit: number }[];
  categoryMix: { name: string; value: number }[];
  topProducts: { label: string; revenue: number }[];
  paymentMix: { name: string; value: number }[];
  dailyOrders: { label: string; orders: number }[];
  lowStock: { id: string; product_id: string; name: string; available: number; reorder: number }[];
  recentOrders: { id: string; order_no: string; customer: string; total: number; status: string; payment: string }[];
  topCustomers: { id: string; name: string; outstanding: number }[];
  topSuppliers: { id: string; name: string; payable: number }[];
  nearExpiry: { id: string; product_id: string | null; name: string; lot: string; expiry: string; days: number }[];
  rangeLabel: string;
}

export async function buildDashboard(supabase: Supabase, range: DateRange): Promise<DashboardData> {
  // These reads are all independent — run getVariantOptions, categories, the
  // range queries AND the reorder-point / lots / lot-level reads (used further
  // down for low-stock + near-expiry) in a SINGLE parallel batch. They don't
  // depend on the sale ids resolved later, so pulling them up here removes 3
  // sequential round-trips from the request.
  const [
    variants, { data: catRows }, { data: sales }, { data: orders }, { data: avail },
    { data: customers }, { data: suppliers }, { data: returnsRaw },
    { data: vrows }, { data: lots }, { data: lotLevels },
  ] = await Promise.all([
    getVariantOptions(supabase),
    supabase.from("categories").select("id, name"),
    supabase.from("sales").select("id, total, profit, created_at").gte("created_at", iso(range.from)).lte("created_at", iso(range.to)),
    supabase.from("orders").select("id, order_no, customer_name, total, status, payment_type, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("variant_availability").select("variant_id, on_hand, available"),
    supabase.from("customers").select("id, name, credit_balance"),
    supabase.from("suppliers").select("id, name, balance"),
    supabase.from("sale_returns").select("id, created_at").gte("created_at", iso(range.from)).lte("created_at", iso(range.to)),
    supabase.from("product_variants").select("id, reorder_point"),
    supabase.from("lots").select("id, variant_id, lot_number, expiry_date").not("expiry_date", "is", null),
    supabase.from("stock_levels").select("lot_id, on_hand").not("lot_id", "is", null),
  ]);
  const vMap = new Map(variants.map((v) => [v.variant_id, v]));
  const catName = new Map<string, string>();
  for (const c of catRows ?? []) catName.set(c.id, c.name);

  const saleIds = (sales ?? []).map((s) => s.id);
  const retIds = (returnsRaw ?? []).map((r) => r.id);
  const [{ data: items }, { data: pays }, { data: retItems }] = await Promise.all([
    saleIds.length ? supabase.from("sale_items").select("sale_id, variant_id, qty, line_total").in("sale_id", saleIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // All payments in range — both in-store (sale_id) and online-store (order_id),
    // so the "Online" segment captures online payments from either channel.
    supabase.from("payments").select("method, amount, order_id").gte("created_at", iso(range.from)).lte("created_at", iso(range.to)),
    retIds.length ? supabase.from("sale_return_items").select("return_id, qty, line_total, unit_cogs").in("return_id", retIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Returns net out of sales/profit (a return is not a sale). Attributed to the
  // return's own date for the trend.
  const retDate = new Map((returnsRaw ?? []).map((r) => [r.id as string, r.created_at as string]));
  const retByDate = new Map<string, { revenue: number; profit: number }>();
  let retRevenue = 0, retProfit = 0;
  for (const ri of retItems ?? []) {
    const rev = Number(ri.line_total); const prof = rev - Number(ri.qty) * Number(ri.unit_cogs);
    retRevenue += rev; retProfit += prof;
    const d = retDate.get(ri.return_id as string) ?? iso(range.from);
    const k = bucketKey(new Date(d), bucketOf(range));
    const cur = retByDate.get(k) ?? { revenue: 0, profit: 0 };
    cur.revenue += rev; cur.profit += prof; retByDate.set(k, cur);
  }

  // KPIs (net of returns)
  const totalSales = (sales ?? []).reduce((s, x) => s + Number(x.total), 0) - retRevenue;
  const totalProfit = (sales ?? []).reduce((s, x) => s + Number(x.profit), 0) - retProfit;
  const ordersInRange = (orders ?? []).filter((o) => o.created_at >= iso(range.from) && o.created_at <= iso(range.to)).length;
  const availMap = new Map((avail ?? []).map((a) => [a.variant_id, a]));
  const stockValue = (avail ?? []).reduce((s, a) => { const v = vMap.get(a.variant_id); return s + Number(a.on_hand) * (v?.cost ?? 0); }, 0);
  const udhaar = (customers ?? []).reduce((s, c) => s + Math.max(Number(c.credit_balance), 0), 0);

  // trend (sales + profit)
  const b = bucketOf(range);
  const trendMap = new Map<string, { label: string; sales: number; profit: number }>();
  for (const s of sales ?? []) {
    const k = bucketKey(new Date(s.created_at), b);
    const cur = trendMap.get(k) ?? { label: k, sales: 0, profit: 0 };
    cur.sales += Number(s.total); cur.profit += Number(s.profit);
    trendMap.set(k, cur);
  }
  for (const [k, rv] of retByDate) {
    const cur = trendMap.get(k) ?? { label: k, sales: 0, profit: 0 };
    cur.sales -= rv.revenue; cur.profit -= rv.profit;
    trendMap.set(k, cur);
  }

  // category mix + top products
  const catMap = new Map<string, number>();
  const prodMap = new Map<string, number>();
  for (const it of items ?? []) {
    const v = vMap.get(it.variant_id as string);
    const cat = v?.category_id ? (catName.get(v.category_id) ?? "—") : "Uncategorised";
    catMap.set(cat, (catMap.get(cat) ?? 0) + Number(it.line_total));
    const pname = v ? v.product_name : "—";
    prodMap.set(pname, (prodMap.get(pname) ?? 0) + Number(it.line_total));
  }

  // payment mix — in-store methods (Cash / Easypaisa / JazzCash / Udhaar) shown
  // individually; every e-commerce payment (linked to an order) rolls up into a
  // single "Online" segment. (Part 4: Card & Bank Transfer were removed.)
  const payMap = new Map<string, number>();
  for (const p of pays ?? []) {
    const m = String(p.method).toUpperCase();
    const bucket = p.order_id
      ? "Online"
      : m === "CASH" ? "Cash"
      : m === "EASYPAISA" ? "Easypaisa"
      : m === "JAZZCASH" ? "JazzCash"
      : m === "UDHAAR" ? "Udhaar"
      : "Online"; // COD / any legacy method
    payMap.set(bucket, (payMap.get(bucket) ?? 0) + Number(p.amount));
  }

  // daily orders
  const ordMap = new Map<string, number>();
  for (const o of orders ?? []) {
    if (o.created_at < iso(range.from) || o.created_at > iso(range.to)) continue;
    const k = bucketKey(new Date(o.created_at), b);
    ordMap.set(k, (ordMap.get(k) ?? 0) + 1);
  }

  // low stock (current)
  const lowStock = variants.map((v) => {
    const a = availMap.get(v.variant_id);
    return { id: v.variant_id, product_id: v.product_id, name: `${v.product_name} · ${v.label}`, available: a ? Number(a.available) : 0, reorder: 0 };
  });
  const reorderMap = new Map((vrows ?? []).map((r) => [r.id, Number(r.reorder_point)]));
  const low = lowStock.map((r) => ({ ...r, reorder: reorderMap.get(r.id) ?? 0 }))
    .filter((r) => r.available <= r.reorder).sort((a, b) => a.available - b.available).slice(0, 8);

  // near expiry (FEFO) — lots + lot stock-levels were fetched in the batch above
  const lotOnHand = new Map<string, number>();
  for (const l of lotLevels ?? []) lotOnHand.set(l.lot_id, (lotOnHand.get(l.lot_id) ?? 0) + Number(l.on_hand));
  const nearExpiry = (lots ?? [])
    .filter((l) => (lotOnHand.get(l.id) ?? 0) > 0)
    .map((l) => {
      const v = vMap.get(l.variant_id);
      const days = Math.ceil((new Date(l.expiry_date).getTime() - Date.now()) / 86_400_000);
      return { id: l.id, product_id: v?.product_id ?? null, name: v ? `${v.product_name} · ${v.label}` : "—", lot: l.lot_number, expiry: l.expiry_date, days };
    })
    .filter((l) => l.days <= 90)
    .sort((a, b) => a.days - b.days).slice(0, 8);

  return {
    kpis: { sales: totalSales, profit: totalProfit, orders: ordersInRange, lowStock: low.length, udhaar, stockValue },
    trend: [...trendMap.values()],
    categoryMix: [...catMap.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value),
    topProducts: [...prodMap.entries()].map(([label, revenue]) => ({ label: label.slice(0, 14), revenue: Math.round(revenue) })).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    paymentMix: (["Cash", "Easypaisa", "JazzCash", "Udhaar", "Online"] as const)
      .filter((name) => payMap.has(name))
      .map((name) => ({ name, value: Math.round(payMap.get(name) ?? 0) })),
    dailyOrders: [...ordMap.entries()].map(([label, orders]) => ({ label, orders })),
    lowStock: low,
    recentOrders: (orders ?? []).slice(0, 6).map((o) => ({ id: o.id, order_no: o.order_no, customer: o.customer_name, total: Number(o.total), status: String(o.status).toLowerCase(), payment: String(o.payment_type).toLowerCase() })),
    topCustomers: (customers ?? []).map((c) => ({ id: c.id, name: c.name, outstanding: Number(c.credit_balance) })).filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6),
    topSuppliers: (suppliers ?? []).map((s) => ({ id: s.id, name: s.name, payable: Number(s.balance) })).filter((s) => s.payable > 0).sort((a, b) => b.payable - a.payable).slice(0, 6),
    nearExpiry,
    rangeLabel: range.label,
  };
}
