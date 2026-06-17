"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ShoppingBag, Menu, X } from "lucide-react";
import { useCart } from "./CartProvider";
import type { StoreCategory } from "@/lib/storefront";

export function StoreHeader({ storeName, categories }: { storeName: string; categories: StoreCategory[] }) {
  const { count, setOpen } = useCart();
  const [shopOpen, setShopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const wordmark = storeName.toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-store-line bg-store-paper/90 backdrop-blur">
      <div
        className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 lg:px-10"
        onMouseLeave={() => setShopOpen(false)}
      >
        {/* left nav */}
        <nav className="hidden items-center gap-7 text-[13px] tracking-wide text-store-charcoal md:flex">
          <button
            onMouseEnter={() => setShopOpen(true)}
            onClick={() => setShopOpen((o) => !o)}
            className="transition-colors hover:text-store-ink"
          >
            Shop
          </button>
          <Link href="/shop?sort=new" onMouseEnter={() => setShopOpen(false)} className="transition-colors hover:text-store-ink">New in</Link>
          <Link href="/shop/about" onMouseEnter={() => setShopOpen(false)} className="transition-colors hover:text-store-ink">About</Link>
        </nav>
        <button onClick={() => setMobileOpen(true)} className="text-store-charcoal md:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>

        {/* wordmark */}
        <Link href="/shop" className="text-center font-serif text-2xl tracking-[0.3em] text-store-ink lg:text-3xl">
          {wordmark}
        </Link>

        {/* right icons */}
        <div className="flex items-center justify-end gap-5 text-store-charcoal">
          <button onClick={() => setSearchOpen((o) => !o)} className="transition-colors hover:text-store-ink" aria-label="Search">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button onClick={() => setOpen(true)} className="relative transition-colors hover:text-store-ink" aria-label="Shopping bag">
            <ShoppingBag className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-store-ink px-1 text-[10px] font-medium text-store-paper">
                {count}
              </span>
            )}
          </button>
        </div>

        {/* Shop mega-dropdown */}
        {shopOpen && (
          <div
            className="absolute inset-x-0 top-full border-b border-store-line bg-store-paper"
            onMouseEnter={() => setShopOpen(true)}
          >
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-5 py-8 md:grid-cols-[1fr_2fr] lg:px-10">
              <ul className="space-y-2.5">
                <li>
                  <Link href="/shop" onClick={() => setShopOpen(false)} className="text-[13px] font-medium text-store-ink hover:underline">All products</Link>
                </li>
                {categories.map((c) => (
                  <li key={c.name}>
                    <Link
                      href={`/shop?category=${encodeURIComponent(c.name)}`}
                      onClick={() => setShopOpen(false)}
                      className="text-[13px] text-store-charcoal transition-colors hover:text-store-ink"
                    >
                      {c.name} <span className="text-store-muted">({c.count})</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-4">
                {categories.slice(0, 2).map((c) => (
                  <Link
                    key={c.name}
                    href={`/shop?category=${encodeURIComponent(c.name)}`}
                    onClick={() => setShopOpen(false)}
                    className="group relative flex aspect-[16/10] items-end overflow-hidden bg-store-sand p-4"
                  >
                    <span className="font-serif text-xl text-store-ink">{c.name} →</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* search overlay */}
      {searchOpen && (
        <div className="border-t border-store-line bg-store-paper">
          <form action="/shop" method="get" onSubmit={() => setSearchOpen(false)} className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5 lg:px-10">
            <Search className="h-5 w-5 text-store-muted" />
            <input
              name="q"
              autoFocus
              placeholder="Search products…"
              className="flex-1 bg-transparent font-serif text-xl text-store-ink placeholder:text-store-muted focus:outline-none"
            />
            <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X className="h-5 w-5 text-store-charcoal" /></button>
          </form>
        </div>
      )}

      {/* mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-store-ink/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-store-paper p-6">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-serif text-lg tracking-[0.2em] text-store-ink">{wordmark}</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close"><X className="h-5 w-5 text-store-charcoal" /></button>
            </div>
            <Link href="/shop" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium text-store-ink">All products</Link>
            <Link href="/shop?sort=new" onClick={() => setMobileOpen(false)} className="block py-2 text-sm text-store-charcoal">New in</Link>
            <div className="my-3 h-px bg-store-line" />
            {categories.map((c) => (
              <Link key={c.name} href={`/shop?category=${encodeURIComponent(c.name)}`} onClick={() => setMobileOpen(false)} className="block py-2 text-sm text-store-charcoal">
                {c.name}
              </Link>
            ))}
            <div className="my-3 h-px bg-store-line" />
            <Link href="/shop/about" onClick={() => setMobileOpen(false)} className="block py-2 text-sm text-store-charcoal">About</Link>
          </div>
        </div>
      )}
    </header>
  );
}
