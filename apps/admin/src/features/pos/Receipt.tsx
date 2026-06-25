"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Printer, MessageCircle, Plus, Loader2 } from "lucide-react";
import { Button } from "@hamza/shared/ui/Button";
import { useToast } from "@hamza/shared/ui/Toast";
import { type ReceiptData } from "@/lib/receipt";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { printReceiptHtml } from "@/lib/receipt-html";
import { normalizeWaNumber } from "@hamza/shared/notifications/whatsapp";
import { sendReceiptWhatsApp } from "./receipt-actions";

/**
 * Post-sale receipt. The preview shows the EXACT same PDF that Print/PDF and the
 * WhatsApp send produce (one invoice template — lib/receipt-pdf.ts), so every
 * surface is pixel-identical. There is no separate HTML receipt design anymore.
 */
export function Receipt({
  data,
  customerPhone,
  onClose,
}: {
  data: ReceiptData | null;
  customerPhone?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Build the invoice PDF once per sale and preview it directly (same bytes as
  // Print/Download). Revoke the blob URL when the modal closes / data changes.
  useEffect(() => {
    if (!data) { setPdfUrl(null); return; }
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await buildReceiptPdf(data);
        if (cancelled) return;
        const blob = new Blob([bytes.slice() as unknown as BlobPart], { type: "application/pdf" });
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch {
        if (!cancelled) setPdfUrl(null);
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [data]);

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

  async function whatsapp() {
    if (!data) return;
    setBusy(true);
    const res = await sendReceiptWhatsApp(data, customerPhone);
    setBusy(false);
    if ("error" in res && res.error) return toast(res.error, "error");
    if (res.sent) {
      toast("Receipt PDF sent on WhatsApp");
    } else {
      // No WhatsApp API key yet — the PDF is stored; share its link manually.
      const text = `${data.store.name} — receipt ${data.receipt_no}\n${res.url}`;
      const wa = customerPhone ? `https://wa.me/${normalizeWaNumber(customerPhone)}?text=${encodeURIComponent(text)}` : res.url;
      window.open(wa, "_blank");
      toast("Receipt PDF ready — WhatsApp opened with the link");
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
          {pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
              title={`Invoice ${data.receipt_no}`}
              className="h-[55vh] w-full rounded-lg border border-border bg-white shadow-card"
            />
          ) : (
            <div className="flex h-[55vh] w-full items-center justify-center rounded-lg border border-border bg-white text-text-tertiary">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={printPdf} disabled={printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print / PDF
          </Button>
          <Button variant="secondary" onClick={whatsapp} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} WhatsApp PDF
          </Button>
          <Button className="col-span-2 py-3" onClick={onClose}>
            <Plus className="h-4 w-4" /> New sale
          </Button>
        </div>
      </div>
    </div>
  );
}
