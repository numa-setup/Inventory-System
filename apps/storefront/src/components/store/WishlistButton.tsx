"use client";

import { Heart } from "lucide-react";
import { useWishlist, type WishItem } from "./WishlistProvider";

export function WishlistButton({ product, variant = "overlay" }: { product: WishItem; variant?: "overlay" | "inline" }) {
  const { has, toggle } = useWishlist();
  const active = has(product.slug);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle(product);
  }

  if (variant === "inline") {
    return (
      <button onClick={onClick} className="flex items-center gap-2 text-sm text-store-charcoal transition-colors hover:text-store-ink" aria-pressed={active}>
        <Heart className={`h-4 w-4 ${active ? "fill-store-ink text-store-ink" : ""}`} />
        {active ? "Saved to wishlist" : "Add to wishlist"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-store-paper/85 text-store-charcoal opacity-0 backdrop-blur transition-opacity hover:text-store-ink group-hover:opacity-100 data-[active=true]:opacity-100"
      data-active={active}
    >
      <Heart className={`h-4 w-4 ${active ? "fill-store-ink text-store-ink" : ""}`} />
    </button>
  );
}
