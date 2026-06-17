import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getOrderByNo } from "@/lib/storefront";
import { formatPKR } from "@/lib/utils";

export const metadata = { title: "Order confirmed" };

export default async function OrderConfirmationPage({ params }: { params: Promise<{ order_no: string }> }) {
  const { order_no } = await params;
  const order = await getOrderByNo(decodeURIComponent(order_no));
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl px-5 py-16 lg:px-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-store-ink text-store-paper">
          <Check className="h-7 w-7" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-store-olive">Thank you</p>
        <h1 className="mt-3 font-serif text-4xl text-store-ink">Order confirmed</h1>
        <p className="mt-3 text-sm text-store-muted">
          Your order <span className="font-medium text-store-charcoal">{order.order_no}</span> has been placed.
          We’ll call <span className="text-store-charcoal">{order.customer_phone}</span> to arrange delivery.
        </p>
      </div>

      <div className="mt-10 border border-store-line bg-store-paper p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg text-store-ink">Order summary</h2>
          <span className="text-[11px] uppercase tracking-[0.15em] text-store-muted">{order.status}</span>
        </div>
        <div className="mt-5 divide-y divide-store-line">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between py-3 text-sm">
              <span className="text-store-charcoal">{it.qty} × {it.title}</span>
              <span className="text-store-ink">{formatPKR(it.line_total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1.5 border-t border-store-line pt-4 text-sm">
          <div className="flex justify-between"><span className="text-store-charcoal">Subtotal</span><span className="text-store-ink">{formatPKR(order.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-store-charcoal">Delivery</span><span className="text-store-ink">{order.delivery_fee === 0 ? "Free" : formatPKR(order.delivery_fee)}</span></div>
          <div className="flex justify-between pt-1 font-serif text-lg text-store-ink"><span>Total</span><span>{formatPKR(order.total)}</span></div>
        </div>
        <div className="mt-5 border-t border-store-line pt-4 text-sm text-store-muted">
          <div className="text-store-charcoal">{order.customer_name}</div>
          {order.address && <div>{order.address}</div>}
          <div className="mt-1">Payment: {order.payment_type === "COD" ? "Cash on Delivery" : order.payment_type}</div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/shop" className="inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
