"use client";

import { CheckCircle2, Printer, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { receiptInnerHtml, receiptCss, printReceipt, whatsappUrl, type ReceiptData } from "@/lib/receipt";

/** Post-sale receipt: thermal print / PDF, WhatsApp send, and start a new sale. */
export function Receipt({
  data,
  customerPhone,
  onClose,
}: {
  data: ReceiptData | null;
  customerPhone?: string | null;
  onClose: () => void;
}) {
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
          <Button variant="secondary" onClick={() => window.open(whatsappUrl(data, customerPhone), "_blank")}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button className="col-span-2 py-3" onClick={onClose}>
            <Plus className="h-4 w-4" /> New sale
          </Button>
        </div>
      </div>
    </div>
  );
}
