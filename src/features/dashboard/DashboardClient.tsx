"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Banknote, TrendingUp, ClipboardList, PackageX, Wallet, Boxes, Radio,
  ArrowRight, CalendarClock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardSubtitle, CardBody } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { AreaTrend, BarTrend, DonutChart } from "@/components/charts";
import { formatPKR, formatNumber } from "@/lib/utils";
import type { DashboardData } from "./queries";

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const live = useRealtimeRefresh();

  const orderCols: Column<DashboardData["recentOrders"][number]>[] = [
    { key: "order_no", header: "Order", cell: (r) => <span className="font-medium text-text-primary">{r.order_no}</span> },
    { key: "customer", header: "Customer", cell: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.customer} size={30} /><span className="text-text-primary">{r.customer}</span></div> },
    { key: "total", header: "Total", align: "right", cell: (r) => <span className="tnum font-medium text-text-primary">{formatPKR(r.total)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
    { key: "payment", header: "Payment", cell: (r) => <StatusPill status={r.payment} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="flex items-center gap-1.5 text-sm text-text-tertiary">
            <span className={live ? "text-green-text" : "text-text-tertiary"}><Radio className="inline h-3.5 w-3.5" /></span>
            {live ? "Live" : "Connecting…"} · {data.rangeLabel}
          </p>
        </div>
        <FilterBar />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Sales" value={formatPKR(data.kpis.sales, { compact: true })} icon={Banknote} accent="blue" sensitive />
        <StatTile label="Profit" value={formatPKR(data.kpis.profit, { compact: true })} icon={TrendingUp} accent="green" sensitive />
        <StatTile label="Orders" value={formatNumber(data.kpis.orders)} icon={ClipboardList} accent="purple" />
        <StatTile label="Low Stock" value={formatNumber(data.kpis.lowStock)} icon={PackageX} accent="amber" />
        <StatTile label="Udhaar" value={formatPKR(data.kpis.udhaar, { compact: true })} icon={Wallet} accent="coral" sensitive />
        <StatTile label="Stock Value" value={formatPKR(data.kpis.stockValue, { compact: true })} icon={Boxes} accent="teal" sensitive />
      </div>

      {/* charts row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Sales &amp; Profit</CardTitle><CardSubtitle>{data.rangeLabel}</CardSubtitle></div></CardHeader>
          <CardBody>
            {data.trend.length ? <AreaTrend data={data.trend} dataKey="sales" accent="blue" /> : <ChartEmpty />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Sales by Category</CardTitle><CardSubtitle>{data.rangeLabel}</CardSubtitle></div></CardHeader>
          <CardBody>
            {data.categoryMix.length ? <DonutChart data={data.categoryMix} centerLabel="Total" centerValue={formatPKR(data.kpis.sales, { compact: true })} /> : <ChartEmpty />}
          </CardBody>
        </Card>
      </div>

      {/* charts row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>Top Products</CardTitle><CardSubtitle>By revenue</CardSubtitle></div></CardHeader>
          <CardBody>{data.topProducts.length ? <BarTrend data={data.topProducts} dataKey="revenue" accent="purple" /> : <ChartEmpty />}</CardBody>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Payment Type</CardTitle><CardSubtitle>Cash / Online / Udhaar / COD</CardSubtitle></div></CardHeader>
          <CardBody>{data.paymentMix.length ? <DonutChart data={data.paymentMix} /> : <ChartEmpty />}</CardBody>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Daily Orders</CardTitle><CardSubtitle>{data.rangeLabel}</CardSubtitle></div></CardHeader>
          <CardBody>{data.dailyOrders.length ? <BarTrend data={data.dailyOrders} dataKey="orders" accent="teal" /> : <ChartEmpty />}</CardBody>
        </Card>
      </div>

      {/* lists row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><PackageX className="h-4 w-4 text-amber-icon" /> Low Stock</CardTitle>
            <Link href="/admin/purchasing/receive" className="text-xs font-medium text-brand-600 hover:underline">Reorder all</Link>
          </CardHeader>
          {data.lowStock.length === 0 ? <EmptyState icon={Boxes} title="Everything stocked" description="No variant is at its reorder point." /> : (
            <ul className="divide-y divide-border">
              {data.lowStock.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <div><div className="text-sm font-medium text-text-primary">{r.name}</div><div className="text-xs text-text-tertiary">{formatNumber(r.available)} left · reorder at {formatNumber(r.reorder)}</div></div>
                  <Link href="/admin/purchasing/receive"><Button size="sm" variant="secondary">Reorder</Button></Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
          {data.recentOrders.length === 0 ? <EmptyState icon={ClipboardList} title="No orders yet" description="Online orders will show here." /> : <DataTable columns={orderCols} rows={data.recentOrders} />}
        </Card>
      </div>

      {/* lists row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MiniList title="Top Customers (Udhaar)" rows={data.topCustomers.map((c) => ({ id: c.id, name: c.name, value: formatPKR(c.outstanding) }))} empty="No outstanding udhaar." />
        <MiniList title="Top Suppliers (Payable)" rows={data.topSuppliers.map((s) => ({ id: s.id, name: s.name, value: formatPKR(s.payable) }))} empty="No payables." />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-coral-icon" /> Near Expiry (FEFO)</CardTitle></CardHeader>
          {data.nearExpiry.length === 0 ? <EmptyState icon={CalendarClock} title="Nothing expiring soon" description="No lots within 90 days." /> : (
            <ul className="divide-y divide-border">
              {data.nearExpiry.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
                  <div><div className="text-sm font-medium text-text-primary">{l.name}</div><div className="text-xs text-text-tertiary">Lot {l.lot}</div></div>
                  <StatusPill tone={l.days <= 14 ? "coral" : l.days <= 30 ? "amber" : "neutral"}>{l.days}d</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="pt-2 text-center text-xs text-text-tertiary">
        Figures reconstruct from the ledger and refresh live as sales, stock and orders change.
      </p>
    </div>
  );
}

function MiniList({ title, rows, empty }: { title: string; rows: { id: string; name: string; value: string }[]; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {rows.length === 0 ? <div className="px-4 py-8 text-center text-sm text-text-tertiary">{empty}</div> : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><span className="text-sm text-text-primary">{r.name}</span></div>
              <span className="tnum text-sm font-medium text-text-primary">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChartEmpty() {
  return <div className="flex h-[240px] items-center justify-center text-sm text-text-tertiary">No data in this period</div>;
}

/** Subscribe to sales/stock/orders changes and refresh the server data. */
function useRealtimeRefresh() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
    };
    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_moves" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(channel); };
  }, [router]);

  return live;
}
