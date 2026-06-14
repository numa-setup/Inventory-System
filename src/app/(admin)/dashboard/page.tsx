import {
  Banknote,
  TrendingUp,
  PackageX,
  ClipboardList,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import { StatTile } from "@/components/ui/StatTile";
import {
  Card,
  CardHeader,
  CardTitle,
  CardSubtitle,
  CardBody,
} from "@/components/ui/Card";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { DonutChart } from "@/components/charts/DonutChart";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { formatPKR } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

/* --- Sample data (replaced by live Supabase aggregates once seeded) --- */
const salesTrend = [
  { label: "Mon", sales: 42000, profit: 9800 },
  { label: "Tue", sales: 38500, profit: 8600 },
  { label: "Wed", sales: 51200, profit: 12400 },
  { label: "Thu", sales: 47800, profit: 11200 },
  { label: "Fri", sales: 63400, profit: 15800 },
  { label: "Sat", sales: 72100, profit: 18900 },
  { label: "Sun", sales: 58300, profit: 14100 },
];

const categoryMix = [
  { name: "Grocery", value: 42 },
  { name: "Beverages", value: 23 },
  { name: "Snacks", value: 16 },
  { name: "Household", value: 12 },
  { name: "Other", value: 7 },
];

type OrderRow = {
  id: string;
  customer: string;
  items: number;
  total: number;
  status: string;
  payment: string;
};

const recentOrders: OrderRow[] = [
  { id: "ORD-1042", customer: "Bilal Traders", items: 12, total: 8450, status: "delivered", payment: "paid" },
  { id: "ORD-1041", customer: "Ayesha Khan", items: 3, total: 1290, status: "processing", payment: "cod" },
  { id: "ORD-1040", customer: "Usman Stores", items: 28, total: 19800, status: "in_transit", payment: "paid" },
  { id: "ORD-1039", customer: "Fatima General", items: 7, total: 4320, status: "pending", payment: "udhaar" },
  { id: "ORD-1038", customer: "Hamza Mart", items: 15, total: 11250, status: "cancelled", payment: "cod" },
];

const orderColumns: Column<OrderRow>[] = [
  { key: "id", header: "Order", cell: (r) => <span className="font-medium text-text-primary">{r.id}</span> },
  {
    key: "customer",
    header: "Customer",
    cell: (r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.customer} size={30} />
        <span className="text-text-primary">{r.customer}</span>
      </div>
    ),
  },
  { key: "items", header: "Items", align: "center" },
  {
    key: "total",
    header: "Total",
    align: "right",
    cell: (r) => <span className="tnum font-medium text-text-primary">{formatPKR(r.total)}</span>,
  },
  { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
  { key: "payment", header: "Payment", cell: (r) => <StatusPill status={r.payment} /> },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Dashboard
        </h1>
        <p className="text-sm text-text-tertiary">
          Here&apos;s what&apos;s happening at your store today.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Today's Sales" value={formatPKR(72100)} icon={Banknote} accent="blue" delta={12.5} />
        <StatTile label="Today's Profit" value={formatPKR(18900)} icon={TrendingUp} accent="green" delta={8.2} />
        <StatTile label="Low Stock Items" value={14} icon={PackageX} accent="amber" delta={-3} hint="Need reorder" />
        <StatTile label="Pending Orders" value={9} icon={ClipboardList} accent="purple" hint="Awaiting action" />
        <StatTile label="Outstanding Udhaar" value={formatPKR(46200)} icon={Wallet} accent="coral" hint="12 customers" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sales & Profit</CardTitle>
              <CardSubtitle>Last 7 days</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody>
            <AreaTrend data={salesTrend} dataKey="sales" accent="blue" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sales by Category</CardTitle>
              <CardSubtitle>This month</CardSubtitle>
            </div>
          </CardHeader>
          <CardBody>
            <DonutChart data={categoryMix} centerValue="₨2.4M" centerLabel="Total" />
          </CardBody>
        </Card>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Orders</CardTitle>
            <CardSubtitle>Latest activity across channels</CardSubtitle>
          </div>
        </CardHeader>
        <DataTable columns={orderColumns} rows={recentOrders} />
      </Card>

      <p className="text-center text-xs text-text-tertiary">
        Showing sample data · live figures appear once products & sales are recorded.
      </p>
    </div>
  );
}
