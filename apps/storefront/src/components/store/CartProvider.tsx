"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface CartItem {
  variant_id: string;
  product_id: string;
  slug: string;
  title: string;
  variantLabel?: string | null;
  price: number;
  qty: number;
  available: number;
  image?: string | null;
  category?: string | null;
  category_id?: string | null;
  category_parent_id?: string | null;
  unit?: string;
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "hgs-store-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, ready]);

  const add: CartCtx["add"] = (item, qty = 1) => {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.variant_id === item.variant_id);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + qty, Math.max(item.available, 1)) };
        return next;
      }
      return [...cur, { ...item, qty: Math.min(qty, Math.max(item.available, 1)) }];
    });
    setOpen(true);
  };
  const setQty: CartCtx["setQty"] = (variantId, qty) =>
    setItems((cur) =>
      qty <= 0
        ? cur.filter((x) => x.variant_id !== variantId)
        : cur.map((x) => (x.variant_id === variantId ? { ...x, qty: Math.min(qty, Math.max(x.available, 1)) } : x)),
    );
  const remove: CartCtx["remove"] = (variantId) => setItems((cur) => cur.filter((x) => x.variant_id !== variantId));
  const clear = () => setItems([]);

  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);

  return (
    <Ctx.Provider value={{ items, count, subtotal, open, setOpen, add, setQty, remove, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}
