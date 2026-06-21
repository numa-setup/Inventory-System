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
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { AreaTrend, BarTrend, DonutChart } from "@/components/charts";
import { formatPKR, formatNumber } from "@/lib/utils";
import type { DashboardData } from "./queries";

export function DashboardClient({ data }: { data: DashboardData }) {
  const live = useRealtimeRefresh();

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
        <StatTile label="Sales" value={formatPKR(data.kpis.sales, { compact: true })} fullValue={formatPKR(data.kpis.sales)} icon={Banknote} accent="blue" sensitive />
        <StatTile label="Profit" value={formatPKR(data.kpis.profit, { compact: true })} fullValue={formatPKR(data.kpis.profit)} icon={TrendingUp} accent="green" sensitive />
        <StatTile label="Orders" value={formatNumber(data.kpis.orders)} icon={ClipboardList} accent="purple" />
        <StatTile label="Low Stock" value={formatNumber(data.kpis.lowStock)} icon={PackageX} accent="amber" />
        <StatTile label="Udhaar" value={formatPKR(data.kpis.udhaar, { compact: true })} fullValue={formatPKR(data.kpis.udhaar)} icon={Wallet} accent="coral" sensitive />
        <StatTile label="Stock Value" value={formatPKR(data.kpis.stockValue, { compact: true })} fullValue={formatPKR(data.kpis.stockValue)} icon={Boxes} accent="teal" sensitive />
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
          <CardHeader><div><CardTitle>Payment Type</CardTitle><CardSubtitle>Cash / Easypaisa / JazzCash / Udhaar / Online</CardSubtitle></div></CardHeader>
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
            <SeeAll href="/admin/stock?filter=low_stock" />
          </CardHeader>
          {data.lowStock.length === 0 ? <EmptyState icon={Boxes} title="Everything stocked" description="No variant is at its reorder point." /> : (
            <ul className="divide-y divide-border">
              {data.lowStock.map((r) => (
                <li key={r.id} className="group flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2">
                  <Link href={`/admin/products?edit=${r.product_id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{r.name}</div>
                    <div className="text-xs text-text-tertiary">{formatNumber(r.available)} left · reorder at {formatNumber(r.reorder)}</div>
                  </Link>
                  <Link href="/admin/purchasing/receive"><Button size="sm" variant="secondary">Reorder</Button></Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <SeeAll href="/admin/orders" />
          </CardHeader>
          {data.recentOrders.length === 0 ? <EmptyState icon={ClipboardList} title="No orders yet" description="Online orders will show here." /> : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders?order=${encodeURIComponent(o.order_no)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={o.customer} size={30} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-primary">{o.customer}</div>
                        <div className="text-xs text-text-tertiary">{o.order_no}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={o.status} />
                      <span className="tnum text-sm font-medium text-text-primary">{formatPKR(o.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* lists row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MiniList
          title="Top Customers (Udhaar)"
          seeAll="/admin/customers"
          rows={data.topCustomers.map((c) => ({ id: c.id, name: c.name, value: formatPKR(c.outstanding), href: `/admin/customers?customer=${c.id}` }))}
          empty="No outstanding udhaar."
        />
        <MiniList
          title="Top Suppliers (Payable)"
          seeAll="/admin/purchasing"
          rows={data.topSuppliers.map((s) => ({ id: s.id, name: s.name, value: formatPKR(s.payable), href: `/admin/purchasing/suppliers/${s.id}` }))}
          empty="No payables."
        />
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-coral-icon" /> Near Expiry (FEFO)</CardTitle>
            <SeeAll href="/admin/stock" />
          </CardHeader>
          {data.nearExpiry.length === 0 ? <EmptyState icon={CalendarClock} title="Nothing expiring soon" description="No lots within 90 days." /> : (
            <ul className="divide-y divide-border">
              {data.nearExpiry.map((l) => {
                const inner = (
                  <>
                    <div className="min-w-0"><div className="truncate text-sm font-medium text-text-primary">{l.name}</div><div className="text-xs text-text-tertiary">Lot {l.lot}</div></div>
                    <StatusPill tone={l.days <= 14 ? "coral" : l.days <= 30 ? "amber" : "neutral"}>{l.days}d</StatusPill>
                  </>
                );
                return (
                  <li key={l.id}>
                    {l.product_id ? (
                      <Link href={`/admin/products?edit=${l.product_id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2">{inner}</Link>
                    ) : (
                      <div className="flex items-center justify-between gap-2 px-4 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
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

function SeeAll({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
      See all <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function MiniList({ title, rows, empty, seeAll }: { title: string; rows: { id: string; name: string; value: string; href: string }[]; empty: string; seeAll: string }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {rows.length > 0 && <SeeAll href={seeAll} />}
      </CardHeader>
      {rows.length === 0 ? <div className="px-4 py-8 text-center text-sm text-text-tertiary">{empty}</div> : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <div className="flex min-w-0 items-center gap-2.5"><Avatar name={r.name} size={28} /><span className="truncate text-sm text-text-primary">{r.name}</span></div>
                <span className="tnum shrink-0 text-sm font-medium text-text-primary">{r.value}</span>
              </Link>
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
