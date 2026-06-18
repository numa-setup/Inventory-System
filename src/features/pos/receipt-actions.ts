"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { sendWhatsAppDocument } from "@/lib/notifications/whatsapp";
import { logError } from "@/lib/log";
import type { ReceiptData } from "@/lib/receipt";

/**
 * Generate the receipt PDF, store it, and send it on WhatsApp as a document.
 * If the WhatsApp Cloud API isn't configured, the PDF + URL are still produced
 * (stubbed: true) so the caller can share the link manually.
 */
export async function sendReceiptWhatsApp(data: ReceiptData, phone: string | null | undefined) {
  try {
    const db = createAdminClient();
    const bytes = await buildReceiptPdf(data);
    const safeNo = data.receipt_no.replace(/[^a-zA-Z0-9_-]/g, "");
    const path = `${new Date().getFullYear()}/${safeNo}-${Date.now()}.pdf`;

    const { error } = await db.storage.from("receipts").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) return { error: error.message };

    const url = db.storage.from("receipts").getPublicUrl(path).data.publicUrl;

    let sent = false;
    let stubbed = true;
    if (phone) {
      const res = await sendWhatsAppDocument({
        to: phone,
        link: url,
        filename: `Receipt-${safeNo}.pdf`,
        caption: `${data.store.name} — receipt ${data.receipt_no}`,
      });
      sent = res.ok;
      stubbed = res.stubbed;
      if (res.error) logError(new Error(res.error), { where: "sendReceiptWhatsApp" });
    }

    return { ok: true as const, url, sent, stubbed };
  } catch (e) {
    logError(e, { where: "sendReceiptWhatsApp" });
    return { error: e instanceof Error ? e.message : "Could not prepare the receipt PDF." };
  }
}
