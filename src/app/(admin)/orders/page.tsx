import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { formatPKR } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "new", label: "Needs Confirmation", statuses: ["PLACED"] },
  { key: "ready", label: "Ready to Pack", statuses: ["CONFIRMED", "PACKED"] },
  { key: "transit", label: "In Transit", statuses: ["SHIPPED", "OUT_FOR_DELIVERY"] },
  { key: "done", label: "Delivered / Closed", statuses: ["DELIVERED", "RETURNED", "RTO", "CANCELLED"] },
];

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, status, payment_type, total, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const all = orders ?? [];

  return (
    <div>
      <PageHeader title="Orders & Delivery" subtitle="Online orders flow here from the storefront, in real time" />

      {all.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No online orders yet"
            description="When the customer storefront goes live, orders will appear here grouped by status — needs confirmation, ready to pack, in transit, delivered."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = all.filter((o) => col.statuses.includes(o.status));
            return (
              <div key={col.key} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-heading text-sm font-semibold text-text-primary">{col.label}</h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-tertiary">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-text-tertiary">Empty</div>
                ) : items.map((o) => (
                  <Card key={o.id} className="p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-text-primary">{o.order_no}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar name={o.customer_name} size={26} />
                      <span className="truncate text-sm text-text-secondary">{o.customer_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <StatusPill status={o.payment_type.toLowerCase()} />
                      <span className="tnum font-medium text-text-primary">{formatPKR(Number(o.total))}</span>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
