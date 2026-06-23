"use client";

import { useState } from "react";
import { ProductMedia } from "./ProductMedia";

export function ProductGallery({ images, title, slug }: { images: string[]; title: string; slug: string }) {
  const [active, setActive] = useState(0);
  const list = images.filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden bg-store-sand">
        <ProductMedia src={list[active] ?? null} title={title} seed={slug} />
      </div>
      {list.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {list.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden border transition-colors ${i === active ? "border-store-ink" : "border-store-line hover:border-store-muted"}`}
            >
              <ProductMedia src={img} title={title} seed={`${slug}-${i}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
