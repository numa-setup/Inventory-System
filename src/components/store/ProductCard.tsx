import Link from "next/link";
import { ProductMedia } from "./ProductMedia";
import { formatPKR } from "@/lib/utils";
import type { StoreProduct } from "@/lib/storefront";

export function ProductCard({ p }: { p: StoreProduct }) {
  return (
    <Link href={`/shop/product/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-store-sand">
        <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          <ProductMedia src={p.images[0] ?? p.image_url} title={p.title} seed={p.slug} />
        </div>
        {p.available <= 0 && (
          <span className="absolute left-3 top-3 bg-store-ink/85 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-store-paper">
            Sold out
          </span>
        )}
      </div>
      <div className="pt-3.5 text-center">
        {p.category_name && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-store-muted">{p.category_name}</div>
        )}
        <h3 className="mt-1.5 font-serif text-lg leading-snug text-store-ink">{p.title}</h3>
        <div className="mt-1 text-sm tracking-wide text-store-charcoal">{formatPKR(p.price)}</div>
      </div>
    </Link>
  );
}
