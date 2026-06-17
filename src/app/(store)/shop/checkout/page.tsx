"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/components/store/CartProvider";
import { ProductMedia } from "@/components/store/ProductMedia";
import { formatPKR } from "@/lib/utils";

export default function CheckoutPage() {
  const { items, subtotal, setQty, remove } = useCart();

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-10">
      <h1 className="mb-10 text-center font-serif text-4xl text-store-ink">Your Bag</h1>

      {items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-store-muted">Your bag is empty.</p>
          <Link href="/shop" className="mt-4 inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper">Start shopping</Link>
        </div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          {/* items */}
          <div className="divide-y divide-store-line border-y border-store-line">
            {items.map((it) => (
              <div key={it.variant_id} className="flex gap-5 py-6">
                <div className="relative h-28 w-24 shrink-0 overflow-hidden bg-store-sand">
                  <ProductMedia src={it.image} title={it.title} seed={it.slug} />
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <div>
                      {it.category && <div className="text-[11px] uppercase tracking-[0.15em] text-store-muted">{it.category}</div>}
                      <Link href={`/shop/product/${it.slug}`} className="font-serif text-lg text-store-ink hover:underline">{it.title}</Link>
                      {it.variantLabel && <div className="text-xs text-store-muted">{it.variantLabel}</div>}
                    </div>
                    <div className="text-store-charcoal">{formatPKR(it.price * it.qty)}</div>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center border border-store-line">
                      <button onClick={() => setQty(it.variant_id, it.qty - 1)} className="px-2.5 py-1.5 text-store-charcoal hover:bg-store-sand"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-8 text-center text-sm text-store-ink">{it.qty}</span>
                      <button onClick={() => setQty(it.variant_id, it.qty + 1)} disabled={it.qty >= it.available} className="px-2.5 py-1.5 text-store-charcoal hover:bg-store-sand disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <button onClick={() => remove(it.variant_id)} className="text-xs text-store-muted underline hover:text-store-ink">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* summary */}
          <div>
            <div className="border border-store-line bg-store-paper p-6">
              <h2 className="font-serif text-xl text-store-ink">Order summary</h2>
              <div className="mt-5 flex justify-between text-sm">
                <span className="text-store-charcoal">Subtotal</span>
                <span className="text-store-ink">{formatPKR(subtotal)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-store-charcoal">Delivery</span>
                <span className="text-store-muted">Calculated at checkout</span>
              </div>
              <div className="my-4 h-px bg-store-line" />
              <div className="flex justify-between">
                <span className="font-serif text-lg text-store-ink">Total</span>
                <span className="font-serif text-lg text-store-ink">{formatPKR(subtotal)}</span>
              </div>
              <button className="mt-6 w-full cursor-not-allowed bg-store-ink/60 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper" disabled>
                Delivery checkout — coming soon
              </button>
              <p className="mt-3 text-center text-xs text-store-muted">Your bag is saved on this device.</p>
            </div>
            <Link href="/shop" className="mt-4 block text-center text-sm text-store-charcoal underline">Continue shopping</Link>
          </div>
        </div>
      )}
    </div>
  );
}
