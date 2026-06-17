"use client";

import Link from "next/link";
import { Heart, X } from "lucide-react";
import { useWishlist } from "@/components/store/WishlistProvider";
import { ProductMedia } from "@/components/store/ProductMedia";
import { formatPKR } from "@/lib/utils";

export default function WishlistPage() {
  const { items, remove, clear } = useWishlist();

  if (!items.length) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <Heart className="mx-auto h-10 w-10 text-store-muted" strokeWidth={1.25} />
        <h1 className="mt-4 font-serif text-3xl text-store-ink">Your wishlist is empty</h1>
        <p className="mt-2 text-sm text-store-muted">Tap the heart on any product to save it for later.</p>
        <Link href="/shop" className="mt-6 inline-block bg-store-ink px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
      <div className="mb-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-store-muted">Saved for later</p>
        <h1 className="mt-2 font-serif text-4xl text-store-ink">Wishlist</h1>
        <button onClick={clear} className="mt-3 text-sm text-store-charcoal underline underline-offset-4 hover:text-store-ink">Clear all</button>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <div key={p.slug} className="group">
            <Link href={`/shop/product/${p.slug}`} className="block">
              <div className="relative aspect-[4/5] overflow-hidden bg-store-sand">
                <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
                  <ProductMedia src={p.image} title={p.title} seed={p.slug} />
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(p.slug); }}
                  aria-label="Remove from wishlist"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-store-paper/85 text-store-charcoal backdrop-blur transition-colors hover:text-coral-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </Link>
            <div className="pt-3.5 text-center">
              {p.category && <div className="text-[11px] uppercase tracking-[0.18em] text-store-muted">{p.category}</div>}
              <Link href={`/shop/product/${p.slug}`} className="mt-1.5 block font-serif text-lg leading-snug text-store-ink hover:underline">{p.title}</Link>
              <div className="mt-1 text-sm tracking-wide text-store-charcoal">{formatPKR(p.price)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
