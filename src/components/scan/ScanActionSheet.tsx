"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Package, Tag, Boxes, ExternalLink, AlertTriangle, Loader2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cn, formatPKR } from "@/lib/utils";
import { ensureCatalog, type CatalogItem } from "@/lib/catalog-cache";
import { updateVariant } from "@/features/products/actions";
import { adjustStock } from "@/features/stock/actions";

/**
 * Global "scan anywhere" result. Shows the resolved product with live price &
 * stock and quick actions (change price, quick stock adjust, open product), or
 * an unknown-barcode prompt. Mounted once by ScanProvider.
 */
export function ScanActionSheet({
  item,
  unknown,
  onClose,
}: {
  item: CatalogItem | null;
  unknown: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<null | "price" | "stock">(null);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [dir, setDir] = useState<"add" | "remove">("add");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(null);
    setPrice(item ? String(item.price) : "");
    setQty("");
    setDir("add");
  }, [item, unknown]);

  if (!item && !unknown) return null;

  async function savePrice() {
    if (!item) return;
    setBusy(true);
    const res = await updateVariant(item.variant_id, { sale_price: Number(price) || 0 });
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    toast("Price updated");
    await ensureCatalog({ force: true });
    onClose();
  }

  async function saveStock() {
    if (!item) return;
    const n = Number(qty);
    if (!n || n <= 0) return toast("Enter a quantity", "error");
    setBusy(true);
    const res = await adjustStock({
      variant_id: item.variant_id,
      product_id: item.product_id,
      direction: dir,
      qty: n,
      reason: "Quick adjust (scan)",
    });
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    toast(`Stock ${dir === "add" ? "added" : "removed"}`);
    await ensureCatalog({ force: true });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-drawer animate-fade-in sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 font-heading font-semibold text-text-primary">
            <Package className="h-4 w-4" /> Scanned item
          </span>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2"><X className="h-4 w-4" /></button>
        </div>

        {unknown ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-amber-icon/30 bg-amber-tile px-3 py-2 text-sm text-amber-text">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Unknown barcode <span className="font-mono">{unknown}</span>
            </div>
            <p className="text-sm text-text-secondary">This barcode isn’t on file. Create the product or link it while receiving stock.</p>
            <Button className="w-full" onClick={() => { onClose(); router.push("/admin/products"); }}>
              <ExternalLink className="h-4 w-4" /> Go to Products
            </Button>
          </div>
        ) : item ? (
          <div className="space-y-3">
            <div>
              <div className="font-medium text-text-primary">{item.product_name}</div>
              <div className="text-xs text-text-tertiary">{item.label} · {item.sku}{item.barcode ? ` · ${item.barcode}` : ""}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-text-tertiary">Price</div>
                <div className="tnum font-heading text-lg font-bold text-text-primary">{formatPKR(item.price)}</div>
              </div>
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-text-tertiary">In stock</div>
                <div className={cn("tnum font-heading text-lg font-bold", item.available <= 0 ? "text-coral-text" : "text-text-primary")}>
                  {item.available}
                </div>
              </div>
            </div>

            {mode === "price" ? (
              <div className="flex items-center gap-2">
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" autoFocus />
                <Button onClick={savePrice} disabled={busy} className="shrink-0">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</Button>
              </div>
            ) : mode === "stock" ? (
              <div className="flex items-center gap-2">
                <select value={dir} onChange={(e) => setDir(e.target.value as "add" | "remove")} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
                  <option value="add">Add</option>
                  <option value="remove">Remove</option>
                </select>
                <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="h-9" autoFocus />
                <Button onClick={saveStock} disabled={busy} className="shrink-0">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" className="flex-col gap-1 py-2.5 text-xs" onClick={() => setMode("price")}>
                  <Tag className="h-4 w-4" /> Price
                </Button>
                <Button variant="secondary" className="flex-col gap-1 py-2.5 text-xs" onClick={() => setMode("stock")}>
                  <Boxes className="h-4 w-4" /> Adjust
                </Button>
                <Button variant="secondary" className="flex-col gap-1 py-2.5 text-xs" onClick={() => { onClose(); router.push("/admin/products"); }}>
                  <ExternalLink className="h-4 w-4" /> Open
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
