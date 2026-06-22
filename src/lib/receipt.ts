// Thermal (80mm) receipt rendering — print / PDF / WhatsApp. No dependencies.

export interface ReceiptItem {
  name: string;
  label?: string;
  qty: number;
  /** Product unit shown next to the qty (e.g. Pcs / Kg). */
  unit?: string | null;
  unit_price: number;
  /** Per-line discount in rupees (off the gross line). */
  discount?: number;
  line_total: number;
}

export interface ReceiptStore {
  name: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  header?: string;
  footer?: string;
  ntn?: string;
}

export interface ReceiptData {
  store: ReceiptStore;
  receipt_no: string;
  date: string; // already formatted
  cashier: string;
  customer?: string | null;
  /** Customer address line shown under the name on the invoice. */
  customer_address?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  tax_percent: number;
  total: number;
  payments: { method: string; amount: number }[];
  change: number;
}

const PKR = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Inner HTML of the receipt body (used both for preview and printing). */
export function receiptInnerHtml(d: ReceiptData): string {
  const rows = d.items
    .map(
      (it) =>
        `<tr><td colspan="3" class="nm">${esc(it.name)}${it.label ? ` <span class="dim">${esc(it.label)}</span>` : ""}</td></tr>` +
        `<tr><td class="dim">${it.qty} × ${PKR(it.unit_price)}</td><td></td><td class="r">${PKR(it.line_total)}</td></tr>` +
        (it.discount && it.discount > 0
          ? `<tr><td class="dim">  discount</td><td></td><td class="r dim">-${PKR(it.discount)}</td></tr>`
          : ""),
    )
    .join("");

  const totals =
    `<tr><td colspan="2">Subtotal</td><td class="r">${PKR(d.subtotal)}</td></tr>` +
    (d.discount > 0 ? `<tr><td colspan="2">Discount</td><td class="r">-${PKR(d.discount)}</td></tr>` : "") +
    (d.tax > 0 ? `<tr><td colspan="2">Tax (${d.tax_percent}%)</td><td class="r">${PKR(d.tax)}</td></tr>` : "") +
    `<tr class="tot"><td colspan="2">TOTAL</td><td class="r">${PKR(d.total)}</td></tr>`;

  const pays =
    d.payments.map((p) => `<tr><td colspan="2">${esc(p.method)}</td><td class="r">${PKR(p.amount)}</td></tr>`).join("") +
    (d.change > 0 ? `<tr><td colspan="2">Change</td><td class="r">${PKR(d.change)}</td></tr>` : "");

  return (
    `<div class="rcpt">` +
    (d.store.logo_url ? `<img src="${esc(d.store.logo_url)}" class="logo" alt="" />` : "") +
    `<div class="store">${esc(d.store.name)}</div>` +
    (d.store.address ? `<div class="dim ctr">${esc(d.store.address)}</div>` : "") +
    (d.store.phone ? `<div class="dim ctr">${esc(d.store.phone)}</div>` : "") +
    (d.store.ntn ? `<div class="dim ctr">NTN: ${esc(d.store.ntn)}</div>` : "") +
    (d.store.header ? `<div class="ctr hdr">${esc(d.store.header)}</div>` : "") +
    `<div class="hr"></div>` +
    `<div class="meta"><span>${esc(d.receipt_no)}</span><span>${esc(d.date)}</span></div>` +
    `<div class="meta"><span>Cashier: ${esc(d.cashier)}</span>${d.customer ? `<span>${esc(d.customer)}</span>` : ""}</div>` +
    `<div class="hr"></div>` +
    `<table>${rows}</table>` +
    `<div class="hr"></div>` +
    `<table>${totals}</table>` +
    `<div class="hr"></div>` +
    `<table>${pays}</table>` +
    `<div class="hr"></div>` +
    `<div class="ctr ftr">${d.store.footer ? esc(d.store.footer) : "Shukriya! Thank you!"}</div>` +
    `</div>`
  );
}

const RECEIPT_CSS = `
  .rcpt{width:280px;margin:0 auto;font-family:'Courier New',monospace;color:#000;font-size:12px;line-height:1.35}
  .rcpt .logo{display:block;max-height:54px;margin:0 auto 6px}
  .rcpt .store{text-align:center;font-size:16px;font-weight:700}
  .rcpt .ctr{text-align:center}
  .rcpt .dim{color:#444;font-size:11px}
  .rcpt .hdr{margin:4px 0;font-size:11px}
  .rcpt .ftr{margin-top:4px;font-size:11px}
  .rcpt .hr{border-top:1px dashed #000;margin:6px 0}
  .rcpt .meta{display:flex;justify-content:space-between;font-size:11px}
  .rcpt table{width:100%;border-collapse:collapse}
  .rcpt td{padding:1px 0;vertical-align:top}
  .rcpt td.r{text-align:right;white-space:nowrap}
  .rcpt td.nm{font-weight:600;padding-top:3px}
  .rcpt tr.tot td{font-weight:700;font-size:13px;border-top:1px solid #000;padding-top:3px}
`;

/** Open the print dialog with an 80mm-optimized receipt (also "Save as PDF"). */
export function printReceipt(d: ReceiptData) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return false;
  w.document.write(
    `<html><head><title>${esc(d.receipt_no)}</title><style>` +
      `@page{size:80mm auto;margin:3mm}body{margin:0}` +
      RECEIPT_CSS +
      `</style></head><body>${receiptInnerHtml(d)}` +
      `<script>window.onload=function(){window.print();}</script></body></html>`,
  );
  w.document.close();
  return true;
}

export const receiptCss = RECEIPT_CSS;

/** Plain-text receipt for WhatsApp. */
export function receiptText(d: ReceiptData): string {
  const lines = [
    `*${d.store.name}*`,
    d.store.phone ?? "",
    `${d.receipt_no} · ${d.date}`,
    "------------------------------",
    ...d.items.map((it) => `${it.qty} × ${it.name}  ${PKR(it.line_total)}`),
    "------------------------------",
    `Subtotal: ${PKR(d.subtotal)}`,
    d.discount > 0 ? `Discount: -${PKR(d.discount)}` : "",
    d.tax > 0 ? `Tax: ${PKR(d.tax)}` : "",
    `*TOTAL: ${PKR(d.total)}*`,
    ...d.payments.map((p) => `${p.method}: ${PKR(p.amount)}`),
    d.change > 0 ? `Change: ${PKR(d.change)}` : "",
    "",
    d.store.footer || "Shukriya! Thank you!",
  ];
  return lines.filter(Boolean).join("\n");
}

/** wa.me link (prefills the customer's number when known). */
export function whatsappUrl(d: ReceiptData, phone?: string | null): string {
  const num = (phone ?? "").replace(/[^\d]/g, "");
  const text = encodeURIComponent(receiptText(d));
  return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
}
