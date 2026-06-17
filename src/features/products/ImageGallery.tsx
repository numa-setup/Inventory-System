"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Star, Package } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { getProductImages, uploadProductImages, removeProductImageUrl, setPrimaryProductImage } from "./actions";

export function ImageGallery({ productId, onChanged }: { productId: string; onChanged?: () => void }) {
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProductImages(productId).then((imgs) => { setImages(imgs); setLoaded(true); });
  }, [productId]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files || !files.length) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await uploadProductImages(productId, fd);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "images" in res && res.images) { setImages(res.images); toast("Photos added"); onChanged?.(); }
  }
  async function remove(url: string) {
    setBusy(true);
    const res = await removeProductImageUrl(productId, url);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "images" in res && res.images) { setImages(res.images); onChanged?.(); }
  }
  async function makeCover(url: string) {
    setBusy(true);
    const res = await setPrimaryProductImage(productId, url);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "images" in res && res.images) { setImages(res.images); toast("Cover updated"); onChanged?.(); }
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Product photos</p>
          <p className="text-xs text-text-tertiary">First photo is the cover. JPG/PNG/WebP, up to 5 MB each.</p>
        </div>
        <input ref={ref} type="file" accept="image/*" multiple onChange={onFiles} className="hidden" />
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Add photos
        </Button>
      </div>

      {!loaded ? (
        <div className="py-4 text-center text-xs text-text-tertiary">Loading…</div>
      ) : images.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-tertiary">
          <Package className="h-4 w-4" /> No photos yet — add some to show on the storefront.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((url, i) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand-500 px-1 text-[9px] font-medium text-white">Cover</span>}
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && (
                  <button onClick={() => makeCover(url)} disabled={busy} title="Make cover" className="rounded bg-white/90 p-1.5 text-text-primary hover:bg-white">
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => remove(url)} disabled={busy} title="Remove" className="rounded bg-white/90 p-1.5 text-coral-text hover:bg-white">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
