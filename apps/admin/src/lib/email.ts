import "server-only";

// Minimal Resend sender for admin auth emails (OTP + password reset). Reads keys
// from env only (RESEND_API_KEY, AUTH_EMAIL_FROM) — never hardcoded/committed.

interface SendArgs { to: string; subject: string; html: string }

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.AUTH_EMAIL_FROM;
}

export async function sendAdminEmail({ to, subject, html }: SendArgs): Promise<{ ok: true } | { error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!key || !from) {
    return { error: "Email isn’t configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM in apps/admin/.env.local." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `Email send failed (${res.status}). ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Email send failed." };
  }
}

/** Simple branded wrapper for auth emails. */
export function authEmailHtml(heading: string, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1C1A17">
    <h2 style="margin:0 0 12px;font-size:18px">${heading}</h2>
    ${bodyHtml}
    <p style="margin-top:24px;font-size:12px;color:#7A736A">Hamza General Store · Admin</p>
  </div>`;
}
