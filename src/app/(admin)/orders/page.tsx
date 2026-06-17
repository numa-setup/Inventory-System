import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/ui/FilterBar";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { OrdersClient, type OrderFull } from "@/features/orders/OrdersClient";

export const metadata: Metadata = { title: "Orders" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = resolveRange(one(sp.preset) || "this_year", one(sp.from), one(sp.to));
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, customer_phone, address, status, payment_type, subtotal, delivery_fee, total, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(300);

  const all = orders ?? [];

  // line items + product names for the loaded orders (bounded to this page of orders)
  const orderIds = all.map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabase.from("order_items").select("order_id, product_id, qty, unit_price, line_total").in("order_id", orderIds)
    : { data: [] as { order_id: string; product_id: string; qty: number; unit_price: number; line_total: number }[] };
  const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
  const { data: prods } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: string; name: string }[] };
  const nameMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
  const itemsByOrder = new Map<string, OrderFull["items"]>();
  for (const it of items ?? []) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push({ title: nameMap.get(it.product_id) ?? "Item", qty: Number(it.qty), unit_price: Number(it.unit_price), line_total: Number(it.line_total) });
    itemsByOrder.set(it.order_id, arr);
  }

  const full: OrderFull[] = all.map((o) => ({
    id: o.id,
    order_no: o.order_no,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    address: o.address,
    status: o.status,
    payment_type: o.payment_type,
    subtotal: Number(o.subtotal),
    delivery_fee: Number(o.delivery_fee),
    total: Number(o.total),
    created_at: o.created_at,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return (
    <div>
      <PageHeader
        title="Orders & Delivery"
        subtitle="Online orders flow here from the storefront — confirm, pack, ship and deliver"
        actions={
          <ExportMenu
            filename="orders"
            title={`Orders · ${range.label}`}
            columns={[
              { key: "order_no", header: "Order" }, { key: "customer", header: "Customer" },
              { key: "status", header: "Status" }, { key: "payment", header: "Payment" },
              { key: "total", header: "Total" }, { key: "date", header: "Date" },
            ]}
            rows={full.map((o) => ({
              order_no: o.order_no, customer: o.customer_name, status: o.status,
              payment: o.payment_type, total: o.total,
              date: new Date(o.created_at).toLocaleDateString("en-PK"),
            }))}
          />
        }
      />

      <FilterBar className="mb-4" />

      {full.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No online orders in this period"
            description="When customers order from the storefront, orders appear here grouped by status — needs confirmation, ready to pack, in transit, delivered."
          />
        </Card>
      ) : (
        <OrdersClient orders={full} />
      )}
    </div>
  );
}
