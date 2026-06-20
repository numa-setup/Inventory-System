"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Truck, CreditCard, Tag } from "lucide-react";
import { useCart } from "./CartProvider";
import { ProductMedia } from "./ProductMedia";
import { formatPKR } from "@/lib/utils";
import { placeOrder } from "@/features/storefront/order-actions";
import { computePromotions, type Promotion } from "@/lib/discounts";
import type { DeliveryConfig } from "@/lib/storefront";

export function CheckoutForm({ config, promotions = [] }: { config: DeliveryConfig; promotions?: Promotion[] }) {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", note: "" });
  const [pay, setPay] = useState<"COD" | "ONLINE">("COD");
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Promotions preview (server re-checks authoritatively at placeOrder).
  const promo = useMemo(() => computePromotions(
    items.map((it) => ({
      key: it.variant_id, product_id: it.product_id,
      category_ids: [it.category_id, it.category_parent_id].filter(Boolean) as string[],
      qty: it.qty, unit_price: it.price,
    })),
    promotions,
    { couponCode: coupon },
  ), [items, promotions, coupon]);

  const discountedSubtotal = Math.max(subtotal - promo.totalDiscount, 0);
  const deliveryFee = promo.freeDelivery ? 0 : discountedSubtotal >= config.freeOver ? 0 : config.fee;
  const total = discountedSubtotal + deliveryFee;
  const couponEntered = coupon.trim().length > 0;
  const couponWorks = promo.applied.some((a) => a.amount > 0 || a.type === "FREE_DELIVERY");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!items.length) return;
    setBusy(true);
    const res = await placeOrder({
      items: items.map((it) => ({
        variant_id: it.variant_id, product_id: it.product_id, qty: it.qty, unit_price: it.price,
        title: it.title, variant_label: it.variantLabel,
      })),
      customer: { name: form.name, phone: form.phone, address: form.address, email: form.email || null },
      payment_type: pay === "ONLINE" ? "CARD" : "COD",
      coupon_code: coupon || null,
      note: form.note || null,
    });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    clear();
    router.push(res.requires_payment ? `/shop/pay/${res.order_no}` : `/shop/order/${res.order_no}`);
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-serif text-3xl text-store-ink">Your bag is empty</h1>
        <Link href="/shop" className="mt-6 inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 lg:px-10">
      <h1 className="mb-10 text-center font-serif text-4xl text-store-ink">Checkout</h1>
      <form onSubmit={submit} className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* delivery details */}
        <div>
          <h2 className="font-serif text-xl text-store-ink">Delivery details</h2>
          <div className="mt-5 space-y-4">
            <Field label="Full name" value={form.name} onChange={set("name")} required />
            <Field label="Phone" value={form.phone} onChange={set("phone")} required placeholder="03xx xxxxxxx" />
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-store-muted">Delivery address</label>
              <textarea value={form.address} onChange={set("address")} required rows={3}
                className="w-full border border-store-line bg-store-paper px-3.5 py-2.5 text-sm text-store-ink focus:border-store-ink focus:outline-none" />
            </div>
            <Field label="Email (optional)" value={form.email} onChange={set("email")} type="email" />
            <Field label="Order note (optional)" value={form.note} onChange={set("note")} />
          </div>

          <h2 className="mt-10 font-serif text-xl text-store-ink">Payment</h2>
          <div className="mt-4 space-y-2">
            <label className={`flex cursor-pointer items-center gap-3 border px-4 py-3 transition-colors ${pay === "COD" ? "border-store-ink bg-store-paper" : "border-store-line"}`}>
              <input type="radio" name="pay" checked={pay === "COD"} onChange={() => setPay("COD")} className="accent-store-ink" />
              <span className="flex items-center gap-2 text-sm text-store-ink"><Truck className="h-4 w-4" /> Cash on Delivery</span>
            </label>
            <label className={`flex cursor-pointer items-center gap-3 border px-4 py-3 transition-colors ${pay === "ONLINE" ? "border-store-ink bg-store-paper" : "border-store-line"}`}>
              <input type="radio" name="pay" checked={pay === "ONLINE"} onChange={() => setPay("ONLINE")} className="accent-store-ink" />
              <span className="flex items-center gap-2 text-sm text-store-ink"><CreditCard className="h-4 w-4" /> Pay online — Card / JazzCash / Easypaisa</span>
            </label>
          </div>

          {error && <p className="mt-4 border border-coral-icon/30 bg-coral-tile px-3 py-2 text-sm text-coral-text">{error}</p>}
        </div>

        {/* summary */}
        <div>
          <div className="border border-store-line bg-store-paper p-6">
            <h2 className="font-serif text-xl text-store-ink">Your order</h2>
            <div className="mt-4 max-h-72 space-y-4 overflow-y-auto">
              {items.map((it) => {
                const lineOff = promo.lineDiscount.get(it.variant_id) ?? 0;
                const gross = it.price * it.qty;
                return (
                  <div key={it.variant_id} className="flex gap-3">
                    <div className="relative h-16 w-14 shrink-0 overflow-hidden bg-store-sand">
                      <ProductMedia src={it.image} title={it.title} seed={it.slug} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-sm text-store-ink">{it.title}</div>
                      <div className="text-xs text-store-muted">Qty {it.qty}{it.variantLabel ? ` · ${it.variantLabel}` : ""}</div>
                    </div>
                    <div className="text-right text-sm">
                      {lineOff > 0 ? (
                        <>
                          <div className="text-store-muted line-through">{formatPKR(gross)}</div>
                          <div className="text-coral-text">{formatPKR(gross - lineOff)}</div>
                        </>
                      ) : (
                        <div className="text-store-charcoal">{formatPKR(gross)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="my-4 h-px bg-store-line" />

            {/* Coupon */}
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code"
                  className="w-full border border-store-line bg-store-paper px-3 py-2 text-sm uppercase text-store-ink focus:border-store-ink focus:outline-none" />
              </div>
              {couponEntered && (
                couponWorks
                  ? <p className="mt-1 text-xs font-medium text-green-text">Coupon applied.</p>
                  : <p className="mt-1 text-xs text-store-muted">No active offer matches this code.</p>
              )}
            </div>

            <Line label="Subtotal" value={formatPKR(subtotal)} />
            {promo.applied.filter((a) => a.amount > 0).map((a) => (
              <div key={a.discount_id} className="flex justify-between text-sm text-coral-text">
                <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> {a.name}</span>
                <span>− {formatPKR(a.amount)}</span>
              </div>
            ))}
            <Line label="Delivery" value={deliveryFee === 0 ? (promo.freeDelivery ? "Free (offer)" : "Free") : formatPKR(deliveryFee)} />
            {deliveryFee > 0 && <p className="mt-1 text-xs text-store-muted">Free delivery over {formatPKR(config.freeOver)}.</p>}
            <div className="my-4 h-px bg-store-line" />
            <div className="flex justify-between">
              <span className="font-serif text-lg text-store-ink">Total</span>
              <span className="font-serif text-lg text-store-ink">{formatPKR(total)}</span>
            </div>
            <button type="submit" disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 bg-store-ink py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {pay === "ONLINE" ? "Continue to payment" : "Place order"}
            </button>
            <p className="mt-3 text-center text-xs text-store-muted">{pay === "ONLINE" ? "Secure online payment on the next step." : "You’ll pay on delivery."}</p>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, placeholder }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.15em] text-store-muted">{label}</label>
      <input type={type} value={value} onChange={onChange} required={required} placeholder={placeholder}
        className="w-full border border-store-line bg-store-paper px-3.5 py-2.5 text-sm text-store-ink focus:border-store-ink focus:outline-none" />
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-store-charcoal">{label}</span>
      <span className="text-store-ink">{value}</span>
    </div>
  );
}
