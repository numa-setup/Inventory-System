// WhatsApp Business / Cloud API — document (media) messages.
// A plain wa.me link cannot attach files, so sending the receipt PDF requires the
// Cloud API. Configure WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID to go live; until
// then the send is cleanly stubbed (caller falls back to sharing the PDF link).

/** Normalize a local PK number to E.164 digits (03xx… -> 92xx…). */
export function normalizeWaNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("92")) return d;
  if (d.startsWith("0")) return "92" + d.slice(1);
  if (d.length === 10) return "92" + d;
  return d;
}

export async function sendWhatsAppDocument(opts: {
  to: string;
  link: string;
  filename: string;
  caption?: string;
}): Promise<{ ok: boolean; stubbed: boolean; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, stubbed: true };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWaNumber(opts.to),
        type: "document",
        document: { link: opts.link, filename: opts.filename, caption: opts.caption },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, stubbed: false, error: `WhatsApp API ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, stubbed: false };
  } catch (e) {
    return { ok: false, stubbed: false, error: e instanceof Error ? e.message : String(e) };
  }
}
