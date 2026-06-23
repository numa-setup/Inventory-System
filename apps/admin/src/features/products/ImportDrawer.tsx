"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, FileUp, CheckCircle2, AlertTriangle, ArrowLeft, Download } from "lucide-react";
import { Drawer } from "@hamza/shared/ui/Drawer";
import { Button } from "@hamza/shared/ui/Button";
import { useToast } from "@hamza/shared/ui/Toast";
import { cn } from "@hamza/shared/utils";
import { validateProductImport, importProducts, type ValidatedRow } from "./actions";
import { parseProductCsv, buildProductCsvTemplate } from "@/lib/csv";

const rowsFromCsv = parseProductCsv;

export function ImportDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ValidatedRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() { setText(""); setPreview(null); }
  function close() { reset(); onClose(); }

  async function validate() {
    const rows = rowsFromCsv(text);
    if (!rows.length) return toast("No rows found — include a header line.", "error");
    setBusy(true);
    const res = await validateProductImport(rows);
    setBusy(false);
    if (res && "error" in res) return toast(res.error, "error");
    setPreview(res);
  }

  async function runImport() {
    if (!preview) return;
    setBusy(true);
    const res = await importProducts(rowsFromCsv(text));
    setBusy(false);
    if (res && "error" in res && res.error) return toast(res.error, "error");
    if (res && "created" in res) {
      toast(`Imported ${res.created}${res.skipped ? `, skipped ${res.skipped}` : ""}`);
      onDone();
      close();
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
  }

  function downloadTemplate() {
    const blob = new Blob([buildProductCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const okCount = preview?.filter((r) => r.status === "ok").length ?? 0;
  const errCount = preview?.filter((r) => r.status === "error").length ?? 0;

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Import products (CSV)"
      width="max-w-2xl"
      footer={
        preview ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPreview(null)}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button type="button" className="flex-1" disabled={busy || okCount === 0} onClick={runImport}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {okCount} valid
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>Cancel</Button>
            <Button type="button" className="flex-1" disabled={busy || !text.trim()} onClick={validate}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Preview
            </Button>
          </div>
        )
      }
    >
      {!preview ? (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Full columns: <code className="rounded bg-surface-2 px-1">name, brand, category, sub_category, sku, barcode, unit, cost, price, discount_type, discount_value, opening_stock, low_stock, status, description, image_url</code> (first row = header). Only <strong>name</strong> and <strong>sku</strong> are required; everything else is optional.
          </p>
          <p className="text-xs text-text-tertiary">Download the template, fill it in, then import. <code className="rounded bg-surface-2 px-1">image_url</code> sets the product photo (separate multiple URLs with <code className="rounded bg-surface-2 px-1">|</code>).</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4" /> Download CSV template</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Choose CSV file</Button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"name,brand,category,sub_category,sku,barcode,unit,cost,price,discount_type,discount_value,opening_stock,low_stock,status,description,image_url\nMaybelline SuperStay Lipstick,Maybelline,Beauty,Lipstick,MBL-SS-RUBY,8901234567890,pcs,450,699,PERCENT,10,24,5,active,Long-lasting matte,https://picsum.photos/seed/lipstick/600"}
            className="h-56 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs text-text-primary focus-visible:border-brand-500 focus-visible:outline-none"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            <span className="flex items-center gap-1 rounded-lg bg-green-tile px-2.5 py-1 font-medium text-green-text"><CheckCircle2 className="h-4 w-4" /> {okCount} valid</span>
            {errCount > 0 && <span className="flex items-center gap-1 rounded-lg bg-coral-tile px-2.5 py-1 font-medium text-coral-text"><AlertTriangle className="h-4 w-4" /> {errCount} with errors</span>}
          </div>
          <p className="text-xs text-text-tertiary">
            Preview only — nothing is saved yet. Tapping <strong>Import {okCount} valid</strong> adds the {okCount} valid product{okCount === 1 ? "" : "s"}{errCount > 0 ? `; the ${errCount} row${errCount === 1 ? "" : "s"} with errors are skipped` : ""}.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-text-tertiary">
                  <th className="px-2 py-2 text-left font-semibold">#</th>
                  <th className="px-2 py-2 text-left font-semibold">Name</th>
                  <th className="px-2 py-2 text-left font-semibold">SKU</th>
                  <th className="px-2 py-2 text-right font-semibold">Price</th>
                  <th className="px-2 py-2 text-right font-semibold">Qty</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.line} className={cn("border-b border-border/60 last:border-0", r.status === "error" && "bg-coral-tile/40")}>
                    <td className="px-2 py-1.5 text-text-tertiary">{r.line}</td>
                    <td className="px-2 py-1.5 font-medium text-text-primary">{r.name || "—"}</td>
                    <td className="px-2 py-1.5">{r.sku || "—"}</td>
                    <td className="px-2 py-1.5 text-right tnum">{r.price}</td>
                    <td className="px-2 py-1.5 text-right tnum">{r.qty}</td>
                    <td className="px-2 py-1.5">
                      {r.status === "ok"
                        ? <span className="text-green-text">OK</span>
                        : <span className="text-coral-text">{r.errors.join(", ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}
