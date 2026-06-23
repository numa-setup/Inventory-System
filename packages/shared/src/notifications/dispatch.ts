import { createAdminClient } from "../supabase/admin";
import { logError } from "../log";

// Notifications dispatcher. Sends order emails via Resend (real when a key is
// configured in Settings → Integrations) and WhatsApp via a clean stub (no
// provider wired yet — returns a wa.me link so staff can send manually). Every
// attempt is logged to the notifications table, and the owner gets an in-app
// alert for new orders. All sends are best-effort: a notification failure never
// breaks the order flow.

type Db = ReturnType<typeof createAdminClient>;

export interface OrderForNotify {
  order_no: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  address?: string | null;
  total: number;
  items: { title: string; qty: number; line_total: number }[];
}

const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");

async function getConfig(db: Db) {
  const { data } = await db.from("settings").select("store_name, store_info, courier_keys, notif_prefs").eq("id", 1).maybeSingle();
  const info = (data?.store_info ?? {}) as Record<string, string | undefined>;
  const keys = (data?.courier_keys ?? {}) as Record<string, string | undefined>;
  const prefs = (data?.notif_prefs ?? {}) as Record<string, unknown>;
  return {
    storeName: data?.store_name ?? "Hamza General Store",
    ownerEmail: info.email || undefined,
    ownerPhone: info.phone || undefined,
    fromEmail: info.from_email || info.email || "orders@example.com",
    resendKey: keys.resend || undefined,
    whatsappKey: keys.whatsapp || undefined,
    prefs,
  };
}

async function record(
  db: Db,
  n: { recipient_type: "ADMIN" | "CUSTOMER"; event: string; title: string; body: string; channel: "EMAIL" | "WHATSAPP" | "INAPP"; payload: Record<string, unknown> },
) {
  try {
    await db.from("notifications").insert({ recipient_type: n.recipient_type, recipient_id: null, event: n.event, title: n.title, body: n.body, channel: n.channel, payload: n.payload });
  } catch (e) {
    logError(e, { where: "notif.record", event: n.event });
  }
}

async function sendEmail(opts: { to?: string | null; subject: string; html: string; from: string; key?: string }) {
  if (!opts.key || !opts.to) return { status: "stubbed" as const };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!r.ok) return { status: "failed" as const, error: `Resend ${r.status}` };
    const d = (await r.json()) as { id?: string };
    return { status: "sent" as const, id: d.id };
  } catch (e) {
    return { status: "failed" as const, error: String(e) };
  }
}

function waLink(phone: string, text: string) {
  const n = (phone || "").replace(/\D/g, "");
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

// WhatsApp: no Business API provider wired yet, so always stubbed. When a
// provider is chosen, send here and return { status: "sent" } on success.
async function sendWhatsApp(opts: { to: string; text: string; key?: string }) {
  return { status: "stubbed" as const, link: waLink(opts.to, opts.text) };
}

export async function notifyOrderPlaced(order: OrderForNotify) {
  try {
    const db = createAdminClient();
    const cfg = await getConfig(db);
    const itemsText = order.items.map((i) => `${i.qty} × ${i.title}`).join("\n");

    // Customer — confirmation
    const subject = `${cfg.storeName} — order ${order.order_no} confirmed`;
    const text = `Thank you, ${order.customer_name}! Your ${cfg.storeName} order ${order.order_no} is confirmed.\n${itemsText}\nTotal: ${money(order.total)} (Cash on Delivery). We’ll call to arrange delivery.`;
    const html = `<h2 style="font-family:Georgia,serif">Thank you, ${order.customer_name}!</h2>
      <p>Your order <strong>${order.order_no}</strong> is confirmed.</p>
      <pre style="font-family:inherit">${itemsText}</pre>
      <p>Total: <strong>${money(order.total)}</strong> — Cash on Delivery.</p>
      <p style="color:#666">We’ll call ${order.customer_phone} to arrange delivery.</p>`;

    const e = await sendEmail({ to: order.customer_email, subject, html, from: cfg.fromEmail, key: cfg.resendKey });
    await record(db, { recipient_type: "CUSTOMER", event: "order_placed", title: subject, body: text, channel: "EMAIL", payload: { to: order.customer_email, order_no: order.order_no, ...e } });

    const w = await sendWhatsApp({ to: order.customer_phone, text, key: cfg.whatsappKey });
    await record(db, { recipient_type: "CUSTOMER", event: "order_placed", title: "Order confirmation (WhatsApp)", body: text, channel: "WHATSAPP", payload: { to: order.customer_phone, order_no: order.order_no, ...w } });

    // Owner — new-order alert (in-app always; email if owner email set)
    if (cfg.prefs.new_order !== false) {
      const aTitle = `New order ${order.order_no} · ${money(order.total)}`;
      const aBody = `${order.customer_name} (${order.customer_phone})\n${itemsText}${order.address ? `\n${order.address}` : ""}`;
      await record(db, { recipient_type: "ADMIN", event: "order_placed", title: aTitle, body: aBody, channel: "INAPP", payload: { order_no: order.order_no, total: order.total } });
      if (cfg.ownerEmail) {
        const ae = await sendEmail({ to: cfg.ownerEmail, subject: aTitle, html: `<p>${aBody.replace(/\n/g, "<br>")}</p>`, from: cfg.fromEmail, key: cfg.resendKey });
        await record(db, { recipient_type: "ADMIN", event: "order_placed", title: aTitle, body: aBody, channel: "EMAIL", payload: { to: cfg.ownerEmail, ...ae } });
      }
    }
  } catch (e) {
    logError(e, { where: "notifyOrderPlaced" });
  }
}

const STATUS_PHRASE: Record<string, string> = {
  SHIPPED: "is on its way",
  OUT_FOR_DELIVERY: "is out for delivery",
  DELIVERED: "has been delivered",
  CANCELLED: "has been cancelled",
};

export async function notifyOrderStatus(order: { order_no: string; customer_name: string; customer_phone: string; customer_email?: string | null }, status: string) {
  const phrase = STATUS_PHRASE[status];
  if (!phrase) return;
  try {
    const db = createAdminClient();
    const cfg = await getConfig(db);
    const subject = `${cfg.storeName} — order ${order.order_no} update`;
    const text = `Hi ${order.customer_name}, your ${cfg.storeName} order ${order.order_no} ${phrase}.`;
    const html = `<p>${text}</p>`;

    const e = await sendEmail({ to: order.customer_email, subject, html, from: cfg.fromEmail, key: cfg.resendKey });
    await record(db, { recipient_type: "CUSTOMER", event: `order_${status.toLowerCase()}`, title: subject, body: text, channel: "EMAIL", payload: { to: order.customer_email, ...e } });

    const w = await sendWhatsApp({ to: order.customer_phone, text, key: cfg.whatsappKey });
    await record(db, { recipient_type: "CUSTOMER", event: `order_${status.toLowerCase()}`, title: subject, body: text, channel: "WHATSAPP", payload: { to: order.customer_phone, ...w } });
  } catch (e) {
    logError(e, { where: "notifyOrderStatus" });
  }
}
