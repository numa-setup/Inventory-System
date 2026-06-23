"use client";

import Link from "next/link";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "./CartProvider";
import { ProductMedia } from "./ProductMedia";
import { formatPKR } from "@hamza/shared/utils";

export function CartDrawer() {
  const { items, subtotal, open, setOpen, setQty, remove } = useCart();

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-store-ink/30 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-store-paper shadow-drawer transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-store-line px-5 py-4">
          <h2 className="font-serif text-xl text-store-ink">Shopping Bag</h2>
          <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5 text-store-charcoal" /></button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-store-muted">
            <ShoppingBag className="h-8 w-8" strokeWidth={1.25} />
            <p className="text-sm">Your bag is empty.</p>
            <button onClick={() => setOpen(false)} className="mt-1 text-sm text-store-ink underline">Continue shopping</button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              {items.map((it) => (
                <div key={it.variant_id} className="flex gap-4 border-b border-store-line py-5">
                  <div className="relative h-24 w-20 shrink-0 overflow-hidden bg-store-sand">
                    <ProductMedia src={it.image} title={it.title} seed={it.slug} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {it.category && <div className="text-[11px] uppercase tracking-[0.15em] text-store-muted">{it.category}</div>}
                        <Link href={`/shop/product/${it.slug}`} onClick={() => setOpen(false)} className="font-serif text-base text-store-ink hover:underline">
                          {it.title}
                        </Link>
                        {it.variantLabel && <div className="text-xs text-store-muted">{it.variantLabel}</div>}
                      </div>
                      <div className="shrink-0 text-sm text-store-charcoal">{formatPKR(it.price * it.qty)}</div>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center border border-store-line">
                        <button onClick={() => setQty(it.variant_id, it.qty - 1)} className="px-2.5 py-1.5 text-store-charcoal hover:bg-store-sand"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="min-w-7 text-center text-sm text-store-ink">{it.qty}</span>
                        <button onClick={() => setQty(it.variant_id, it.qty + 1)} disabled={it.qty >= it.available} className="px-2.5 py-1.5 text-store-charcoal hover:bg-store-sand disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <button onClick={() => remove(it.variant_id)} className="text-xs text-store-muted underline hover:text-store-ink">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-store-line px-5 py-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-store-charcoal">Subtotal</span>
                <span className="font-serif text-lg text-store-ink">{formatPKR(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-store-muted">Shipping calculated at checkout.</p>
              <Link
                href="/shop/checkout"
                onClick={() => setOpen(false)}
                className="mt-4 block bg-store-ink py-3.5 text-center text-sm uppercase tracking-[0.15em] text-store-paper transition-opacity hover:opacity-90"
              >
                Proceed to Checkout
              </Link>
              <button onClick={() => setOpen(false)} className="mt-2 block w-full py-2 text-center text-sm text-store-charcoal underline">
                Continue shopping
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
