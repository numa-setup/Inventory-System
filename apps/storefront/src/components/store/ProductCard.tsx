import Link from "next/link";
import { ProductMedia } from "./ProductMedia";
import { WishlistButton } from "./WishlistButton";
import { formatPKR } from "@hamza/shared/utils";
import type { StoreProduct } from "@/lib/storefront";

export function ProductCard({ p }: { p: StoreProduct }) {
  return (
    <Link href={`/shop/product/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-store-sand">
        <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          <ProductMedia src={p.images[0] ?? p.image_url} title={p.title} seed={p.slug} />
        </div>
        {p.available <= 0 ? (
          <span className="absolute left-3 top-3 bg-store-ink/85 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-store-paper">
            Sold out
          </span>
        ) : p.sale_label ? (
          <span className="absolute left-3 top-3 bg-coral-icon px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-white">
            {p.sale_label}
          </span>
        ) : null}
        <WishlistButton product={{ slug: p.slug, title: p.title, price: p.sale_price ?? p.price, image: p.images[0] ?? p.image_url, category: p.category_name }} />
      </div>
      <div className="pt-3.5 text-center">
        {p.category_name && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-store-muted">{p.category_name}</div>
        )}
        <h3 className="mt-1.5 font-serif text-lg leading-snug text-store-ink">{p.title}</h3>
        {p.sale_price != null ? (
          <div className="mt-1 flex items-center justify-center gap-2 text-sm tracking-wide">
            <span className="text-store-muted line-through">{formatPKR(p.price)}</span>
            <span className="font-medium text-coral-text">{formatPKR(p.sale_price)}</span>
          </div>
        ) : (
          <div className="mt-1 text-sm tracking-wide text-store-charcoal">{formatPKR(p.price)}</div>
        )}
      </div>
    </Link>
  );
}
