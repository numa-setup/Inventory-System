"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface WishItem {
  slug: string;
  title: string;
  price: number;
  image?: string | null;
  category?: string | null;
}

interface WishCtx {
  items: WishItem[];
  count: number;
  has: (slug: string) => boolean;
  toggle: (item: WishItem) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

const Ctx = createContext<WishCtx | null>(null);
const KEY = "hgs-store-wishlist";

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WishItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, ready]);

  const has = (slug: string) => items.some((x) => x.slug === slug);
  const toggle = (item: WishItem) =>
    setItems((cur) => (cur.some((x) => x.slug === item.slug) ? cur.filter((x) => x.slug !== item.slug) : [item, ...cur]));
  const remove = (slug: string) => setItems((cur) => cur.filter((x) => x.slug !== slug));
  const clear = () => setItems([]);

  const count = useMemo(() => items.length, [items]);

  return <Ctx.Provider value={{ items, count, has, toggle, remove, clear }}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWishlist must be used within WishlistProvider");
  return c;
}
