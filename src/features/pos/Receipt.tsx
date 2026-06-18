"use client";

import { useState } from "react";
import { CheckCircle2, Printer, MessageCircle, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { receiptInnerHtml, receiptCss, printReceipt, type ReceiptData } from "@/lib/receipt";
import { normalizeWaNumber } from "@/lib/notifications/whatsapp";
import { sendReceiptWhatsApp } from "./receipt-actions";

/** Post-sale receipt: thermal print / PDF, WhatsApp PDF send, and start a new sale. */
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2 p-4 scrollbar-thin">
          <style>{receiptCss}</style>
          <div className="mx-auto w-fit rounded-lg bg-white p-3 shadow-card" dangerouslySetInnerHTML={{ __html: receiptInnerHtml(data) }} />
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={() => printReceipt(data)}>
            <Printer className="h-4 w-4" /> Print / PDF
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
