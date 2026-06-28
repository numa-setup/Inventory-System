"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Printer, Plus, Loader2 } from "lucide-react";
import { Button } from "@hamza/shared/ui/Button";
import { useToast } from "@hamza/shared/ui/Toast";
import { type ReceiptData } from "@/lib/receipt";
import { receiptHtml, printReceiptHtml } from "@/lib/receipt-html";

/**
 * Post-sale receipt. The preview and the Print action render the SAME 80mm
 * thermal invoice (one template — lib/receipt-html.ts): the preview is a passive
 * HTML render inside an <iframe>, Print opens the identical document in a pop-up
 * and calls window.print(). All client-side — no server PDF generation.
 */
export function Receipt({
  data,
  onClose,
}: {
  data: ReceiptData | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);

  // Render the invoice once per sale as a passive preview (no auto-print script);
  // the same template backs the Print action below.
  const previewHtml = useMemo(() => (data ? receiptHtml(data, { autoPrint: false }) : null), [data]);

  function printPdf() {
    if (!data) return;
    setPrinting(true);
    try {
      // Print a compact 80mm thermal receipt (HTML + @page size) — not an A4 PDF.
      printReceiptHtml(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the receipt for printing", "error");
    } finally {
      setPrinting(false);
    }
  }

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-drawer animate-fade-in sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-green-text">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-heading text-lg font-semibold">Sale complete</span>
          <span className="ml-auto tnum text-sm text-text-tertiary">{data.receipt_no}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-surface-2 p-4">
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title={`Invoice ${data.receipt_no}`}
              className="h-[55vh] w-full rounded-lg border border-border bg-white shadow-card"
            />
          ) : (
            <div className="flex h-[55vh] w-full items-center justify-center rounded-lg border border-border bg-white text-text-tertiary">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={printPdf} disabled={printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
          </Button>
          <Button className="py-3" onClick={onClose}>
            <Plus className="h-4 w-4" /> New sale
          </Button>
        </div>
      </div>
    </div>
  );
}
