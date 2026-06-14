import type { Metadata } from "next";
import { Banknote, TrendingUp, Receipt, Wallet, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPKR, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

type TopRow = { id: string; name: string; qty: number; revenue: number; profit: number };
type LowRow = { id: string; name: string; available: number; reorder: number };

export default async function ReportsPage() {
  const supabase = await createClient();

  const [{ data: sales }, { data: items }, { data: products }, { data: availability }] =
    await Promise.all([
      supabase.from("sales").select("id, total, cogs_total, profit, created_at"),
      supabase.from("sale_items").select("product_id, qty, line_total, unit_cogs"),
      supabase.from("products").select("id, name, reorder_point"),
      supabase.from("product_availability").select("product_id, on_hand, available, avg_cost"),
    ]);

  const allSales = sales ?? [];
  const totalSales = allSales.reduce((s, x) => s + Number(x.total), 0);
  const totalProfit = allSales.reduce((s, x) => s + Number(x.profit), 0);
  const salesCount = allSales.length;
  const avgBasket = salesCount ? totalSales / salesCount : 0;

  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));

  // Top products by revenue
  const agg = new Map<string, { qty: number; revenue: number; profit: number }>();
  (items ?? []).forEach((it) => {
    const cur = agg.get(it.product_id) ?? { qty: 0, revenue: 0, profit: 0 };
    cur.qty += Number(it.qty);
    cur.revenue += Number(it.line_total);
    cur.profit += Number(it.line_total) - Number(it.qty) * Number(it.unit_cogs);
    agg.set(it.product_id, cur);
  });
  const topProducts: TopRow[] = [...agg.entries()]
    .map(([id, v]) => ({ id, name: prodMap.get(id)?.name ?? "—", ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Stock valuation + low stock
  const stockValue = (availability ?? []).reduce((s, a) => s + Number(a.on_hand) * Number(a.avg_cost), 0);
  const availMap = new Map((availability ?? []).map((a) => [a.product_id, Number(a.available)]));
  const lowStock: LowRow[] = (products ?? [])
    .map((p) => ({ id: p.id, name: p.name, available: availMap.get(p.id) ?? 0, reorder: Number(p.reorder_point) }))
    .filter((r) => r.available <= r.reorder)
    .sort((a, b) => a.available - b.available);

  const topColumns: Column<TopRow>[] = [
    { key: "name", header: "Product", cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    { key: "qty", header: "Units sold", align: "right", cell: (r) => <span className="tnum">{formatNumber(r.qty)}</span> },
    { key: "revenue", header: "Revenue", align: "right", cell: (r) => <span className="tnum text-text-primary">{formatPKR(r.revenue)}</span> },
    { key: "profit", header: "Profit", align: "right", cell: (r) => <span className="tnum text-green-text">{formatPKR(r.profit)}</span> },
  ];
  const lowColumns: Column<LowRow>[] = [
    { key: "name", header: "Product", cell: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
    { key: "available", header: "Available", align: "right", cell: (r) => <span className="tnum text-coral-text">{formatNumber(r.available)}</span> },
    { key: "reorder", header: "Reorder point", align: "right", cell: (r) => <span className="tnum text-text-tertiary">{formatNumber(r.reorder)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales, profit and stock — reconstructed from the ledger" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total Sales" value={formatPKR(totalSales, { compact: true })} icon={Banknote} accent="blue" />
        <StatTile label="Total Profit" value={formatPKR(totalProfit, { compact: true })} icon={TrendingUp} accent="green" />
        <StatTile label="Transactions" value={salesCount} icon={Receipt} accent="purple" />
        <StatTile label="Avg Basket" value={formatPKR(avgBasket)} icon={Wallet} accent="teal" />
        <StatTile label="Stock Value" value={formatPKR(stockValue, { compact: true })} icon={PackageX} accent="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Top Products</CardTitle><CardSubtitle>By revenue (real COGS profit)</CardSubtitle></div></CardHeader>
          {topProducts.length === 0 ? (
            <EmptyState icon={Receipt} title="No sales recorded yet" description="Make a sale in POS to see product performance here." />
          ) : <DataTable columns={topColumns} rows={topProducts} />}
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Low Stock / Reorder</CardTitle><CardSubtitle>At or below reorder point</CardSubtitle></div></CardHeader>
          {lowStock.length === 0 ? (
            <EmptyState icon={PackageX} title="Everything well stocked" description="No products are at their reorder point." />
          ) : <DataTable columns={lowColumns} rows={lowStock} />}
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-text-tertiary">
        Export to PDF / Excel will be added here. Figures update live as sales and stock moves are recorded.
      </p>
    </div>
  );
}
