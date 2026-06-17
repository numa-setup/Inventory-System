"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Package } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { uploadProductImage, removeProductImage } from "./actions";

export function ImageUpload({
  productId,
  current,
  onChanged,
}: {
  productId: string;
  current: string | null;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState(current);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await uploadProductImage(productId, fd);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "url" in res && res.url) {
      setUrl(res.url);
      toast("Photo updated");
      onChanged?.();
    }
  }

  async function remove() {
    setBusy(true);
    const res = await removeProductImage(productId);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    setUrl(null);
    toast("Photo removed");
    onChanged?.();
  }

  return (
    <div className="mb-3 flex items-center gap-4 rounded-lg border border-border bg-surface px-3 py-3">
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-text-tertiary">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-6 w-6" />
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-surface/70"><Loader2 className="h-5 w-5 animate-spin text-text-secondary" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">Product photo</p>
        <p className="text-xs text-text-tertiary">Shown on the storefront. JPG/PNG/WebP, up to 5 MB.</p>
        <div className="mt-2 flex gap-2">
          <input ref={ref} type="file" accept="image/*" onChange={onFile} className="hidden" />
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {url ? "Change" : "Upload"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
