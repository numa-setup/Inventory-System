"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, MapPin, Loader2, Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { formatPKR } from "@/lib/utils";
import { updateOrderStatus } from "./actions";

export interface OrderFull {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  status: string;
  payment_type: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  items: { title: string; qty: number; unit_price: number; line_total: number }[];
}

const COLUMNS = [
  { key: "new", label: "Needs Confirmation", statuses: ["PLACED"] },
  { key: "ready", label: "Ready to Pack", statuses: ["CONFIRMED", "PACKED"] },
  { key: "transit", label: "In Transit", statuses: ["SHIPPED", "OUT_FOR_DELIVERY"] },
  { key: "done", label: "Delivered / Closed", statuses: ["DELIVERED", "RETURNED", "RTO", "CANCELLED"] },
];

const FORWARD: Record<string, string[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
const LABEL: Record<string, string> = {
  CONFIRMED: "Confirm order", PACKED: "Mark packed", SHIPPED: "Ship order",
  OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Mark delivered", CANCELLED: "Cancel order",
};

export function OrdersClient({ orders }: { orders: OrderFull[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState<OrderFull | null>(null);
  const [busy, setBusy] = useState(false);

  // Deep link from the dashboard "Recent Orders" rows: ?order=<order_no> opens
  // that order's detail drawer, then the param is cleared from the URL.
  const orderParam = sp.get("order");
  useEffect(() => {
    if (!orderParam) return;
    const match = orders.find((o) => o.order_no === orderParam);
    if (match) setSelected(match);
    router.replace("/admin/orders");
  }, [orderParam, orders, router]);

  async function act(orderId: string, next: string) {
    setBusy(true);
    const res = await updateOrderStatus(orderId, next);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    toast(next === "SHIPPED" ? "Order shipped — stock deducted" : next === "CANCELLED" ? "Order cancelled — stock released" : `Order ${next.toLowerCase().replace(/_/g, " ")}`);
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => col.statuses.includes(o.status));
          return (
            <div key={col.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-heading text-sm font-semibold text-text-primary">{col.label}</h3>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-tertiary">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-text-tertiary">Empty</div>
              ) : items.map((o) => (
                <button key={o.id} onClick={() => setSelected(o)} className="text-left">
                  <Card className="p-3 transition-shadow hover:shadow-card-hover">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-text-primary">{o.order_no}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar name={o.customer_name} size={26} />
                      <span className="truncate text-sm text-text-secondary">{o.customer_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs text-text-tertiary">{o.items.length} item{o.items.length !== 1 ? "s" : ""} · {o.payment_type}</span>
                      <span className="tnum font-medium text-text-primary">{formatPKR(o.total)}</span>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? selected.order_no : "Order"}
        footer={
          selected && FORWARD[selected.status]?.length ? (
            <div className="flex flex-wrap gap-2">
              {FORWARD[selected.status].map((next) => (
                <Button
                  key={next}
                  variant={next === "CANCELLED" ? "danger" : "primary"}
                  className="flex-1"
                  disabled={busy}
                  onClick={() => act(selected.id, next)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : next === "CANCELLED" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  {LABEL[next]}
                </Button>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-text-tertiary">No further action.</div>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <StatusPill status={selected.status} />
              <span className="text-xs text-text-tertiary">{new Date(selected.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>

            <div className="rounded-xl border border-border p-3">
              <div className="font-medium text-text-primary">{selected.customer_name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary"><Phone className="h-3.5 w-3.5" /> {selected.customer_phone}</div>
              {selected.address && <div className="mt-1 flex items-start gap-1.5 text-sm text-text-secondary"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {selected.address}</div>}
            </div>

            <div className="rounded-xl border border-border">
              {selected.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm last:border-0">
                  <span className="text-text-secondary">{it.qty} × {it.title}</span>
                  <span className="tnum text-text-primary">{formatPKR(it.line_total)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatPKR(selected.subtotal)} />
              <Row label="Delivery" value={selected.delivery_fee === 0 ? "Free" : formatPKR(selected.delivery_fee)} />
              <div className="flex justify-between border-t border-border pt-2 font-semibold text-text-primary">
                <span>Total</span><span className="tnum">{formatPKR(selected.total)}</span>
              </div>
              <div className="pt-1 text-xs text-text-tertiary">Payment: {selected.payment_type === "COD" ? "Cash on Delivery" : selected.payment_type}</div>
            </div>

            {(selected.status === "PLACED" || selected.status === "CONFIRMED" || selected.status === "PACKED") && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-text-tertiary">
                Stock for this order is currently <strong>held</strong>. Shipping deducts it from inventory; cancelling releases it back.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-text-secondary"><span>{label}</span><span className="tnum text-text-primary">{value}</span></div>;
}
