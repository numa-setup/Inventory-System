"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { useCart } from "./CartProvider";
import { formatPKR } from "@/lib/utils";
import type { StoreProduct, StoreVariant } from "@/lib/storefront";

export function AddToBag({ product, variants }: { product: StoreProduct; variants: StoreVariant[] }) {
  const { add } = useCart();
  const sellable = variants.length ? variants : [{ variant_id: product.product_id, label: "Default", sku: "", price: product.price, available: product.available, image_url: product.image_url }];
  const showVariants = product.has_variants && variants.length > 1;
  const [variantId, setVariantId] = useState(sellable[0].variant_id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = useMemo(() => sellable.find((v) => v.variant_id === variantId) ?? sellable[0], [sellable, variantId]);
  const out = selected.available <= 0;

  function handleAdd() {
    if (out) return;
    add(
      {
        variant_id: selected.variant_id,
        product_id: product.product_id,
        slug: product.slug,
        title: product.title,
        variantLabel: showVariants ? selected.label : null,
        price: selected.price,
        available: selected.available,
        image: selected.image_url ?? product.images[0] ?? product.image_url,
        category: product.category_name,
        unit: product.base_unit,
      },
      qty,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="space-y-5">
      <div className="font-serif text-2xl text-store-ink">{formatPKR(selected.price)}</div>

      {showVariants && (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.15em] text-store-muted">Option</div>
          <div className="flex flex-wrap gap-2">
            {sellable.map((v) => (
              <button
                key={v.variant_id}
                onClick={() => setVariantId(v.variant_id)}
                disabled={v.available <= 0}
                className={`border px-4 py-2 text-sm transition-colors disabled:opacity-30 ${
                  v.variant_id === variantId ? "border-store-ink bg-store-ink text-store-paper" : "border-store-line text-store-charcoal hover:border-store-ink"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center border border-store-line">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3.5 py-3 text-store-charcoal hover:bg-store-sand"><Minus className="h-4 w-4" /></button>
          <span className="min-w-10 text-center text-store-ink">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(q + 1, Math.max(selected.available, 1)))} disabled={qty >= selected.available} className="px-3.5 py-3 text-store-charcoal hover:bg-store-sand disabled:opacity-30"><Plus className="h-4 w-4" /></button>
        </div>
        <button
          onClick={handleAdd}
          disabled={out}
          className="flex-1 bg-store-ink py-3.5 text-xs uppercase tracking-[0.18em] text-store-paper transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {out ? "Sold out" : added ? <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> Added</span> : "Add to Bag"}
        </button>
      </div>

      <div className="text-xs text-store-muted">
        {out ? "Currently unavailable." : `${selected.available} in stock · ready to ship`}
      </div>
    </div>
  );
}
