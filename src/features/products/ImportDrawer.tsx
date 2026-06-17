"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, FileUp, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { validateProductImport, importProducts, type ImportRow, type ValidatedRow } from "./actions";

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

const COLS: Record<string, string[]> = {
  name: ["name", "product"],
  sku: ["sku", "code"],
  barcode: ["barcode", "ean"],
  price: ["price", "sale_price", "sale price", "retail"],
  cost: ["cost", "purchase", "buy"],
  qty: ["qty", "quantity", "opening_qty", "opening", "stock", "on_hand"],
};

function rowsFromCsv(text: string): ImportRow[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idx = (key: string) => header.findIndex((h) => COLS[key].includes(h));
  const iName = idx("name"), iSku = idx("sku"), iBar = idx("barcode"), iPrice = idx("price"), iCost = idx("cost"), iQty = idx("qty");
  return grid.slice(1).map((r) => ({
    name: (iName >= 0 ? r[iName] : "")?.trim() ?? "",
    sku: (iSku >= 0 ? r[iSku] : "")?.trim() ?? "",
    barcode: (iBar >= 0 ? r[iBar] : "")?.trim() || undefined,
    price: Number(iPrice >= 0 ? r[iPrice] : 0) || 0,
    cost: Number(iCost >= 0 ? r[iCost] : 0) || 0,
    qty: Number(iQty >= 0 ? r[iQty] : 0) || 0,
  }));
}

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
            Columns: <code className="rounded bg-surface-2 px-1">name, sku, barcode, price, cost, qty</code> (first row = header; barcode/qty optional).
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Choose CSV file</Button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"name,sku,barcode,price,cost,qty\nSugar 1kg,GRO-SUG-1,,180,150,40"}
            className="h-56 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs text-text-primary focus-visible:border-brand-500 focus-visible:outline-none"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            <span className="flex items-center gap-1 rounded-lg bg-green-tile px-2.5 py-1 font-medium text-green-text"><CheckCircle2 className="h-4 w-4" /> {okCount} valid</span>
            {errCount > 0 && <span className="flex items-center gap-1 rounded-lg bg-coral-tile px-2.5 py-1 font-medium text-coral-text"><AlertTriangle className="h-4 w-4" /> {errCount} with errors</span>}
          </div>
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
