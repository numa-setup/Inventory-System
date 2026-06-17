"use client";

import { useEffect, useState } from "react";
import { Barcode, Loader2, Printer, Wand2 } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { code128Svg } from "@/lib/barcode";
import { ensureCatalog } from "@/lib/catalog-cache";
import { formatPKR } from "@/lib/utils";
import { assignInternalBarcode } from "./actions";

export interface LabelTarget {
  variant_id: string;
  product_id: string;
  name: string;
  label: string;
  sku: string;
  sale_price: number;
  barcode: string | null;
  is_variable_weight: boolean;
}

/** Generate (if needed) and print Code-128 shelf labels for a variant. */
export function LabelDialog({
  target,
  onClose,
  onChanged,
}: {
  target: LabelTarget | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [copies, setCopies] = useState("12");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBarcode(target?.barcode ?? null);
    setCopies("12");
  }, [target]);

  if (!target) return null;
  const sub = target.label && target.label !== "Default" ? ` · ${target.label}` : "";

  async function generate() {
    if (!target) return;
    setBusy(true);
    const res = await assignInternalBarcode(target.variant_id, target.product_id, target.is_variable_weight);
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "barcode" in res && res.barcode) {
      setBarcode(res.barcode);
      await ensureCatalog({ force: true });
      onChanged();
      toast("Internal barcode generated");
    }
  }

  function labelHtml(code: string) {
    return (
      `<div class="lbl">` +
      `<div class="nm">${target!.name}${sub}</div>` +
      `<div class="pr">${formatPKR(target!.sale_price)}</div>` +
      code128Svg(code, { height: 44, moduleWidth: 2, showText: true }) +
      `</div>`
    );
  }

  function print() {
    if (!barcode) return;
    const n = Math.max(1, Math.min(200, Number(copies) || 1));
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return toast("Allow pop-ups to print labels", "error");
    w.document.write(
      `<html><head><title>Labels — ${target!.sku}</title><style>` +
        `@page{margin:8mm}body{font-family:Arial;margin:0}` +
        `.grid{display:flex;flex-wrap:wrap;gap:6px}` +
        `.lbl{width:190px;border:1px solid #eee;border-radius:6px;padding:6px;text-align:center;page-break-inside:avoid}` +
        `.nm{font-size:11px;font-weight:600;line-height:1.2}.pr{font-size:13px;font-weight:700;margin:2px 0}svg{max-width:100%}` +
        `</style></head><body><div class="grid">${Array(n).fill(labelHtml(barcode)).join("")}</div>` +
        `<script>window.onload=function(){window.print()}</script></body></html>`,
    );
    w.document.close();
  }

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title="Print label"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Close</Button>
          <Button type="button" className="flex-1" disabled={!barcode} onClick={print}>
            <Printer className="h-4 w-4" /> Print {copies}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="font-medium text-text-primary">{target.name}{sub}</div>
          <div className="text-xs text-text-tertiary">{target.sku}{target.is_variable_weight ? " · variable weight" : ""}</div>
        </div>

        {barcode ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="w-full [&_svg]:mx-auto" dangerouslySetInnerHTML={{ __html: code128Svg(barcode, { height: 52, moduleWidth: 2, showText: true }) }} />
            <div className="text-sm font-semibold text-text-primary">{formatPKR(target.sale_price)}</div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-4 text-center">
            <Barcode className="mx-auto h-6 w-6 text-text-tertiary" />
            <p className="text-sm text-text-secondary">This item has no barcode yet.</p>
            <Button type="button" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate internal barcode
            </Button>
            <p className="text-[11px] text-text-tertiary">
              {target.is_variable_weight
                ? "A weight template (GS1 prefix-2) is created so the scale’s weight labels scan."
                : "A GS1 prefix-2 EAN-13 is created and saved so the item becomes scannable."}
            </p>
          </div>
        )}

        {barcode && (
          <div>
            <Label>Copies to print</Label>
            <Input type="number" value={copies} onChange={(e) => setCopies(e.target.value)} className="w-32" />
          </div>
        )}
      </div>
    </Drawer>
  );
}
