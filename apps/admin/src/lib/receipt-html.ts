// Thermal-printable HTML version of the SALES INVOICE — used for the Print
// action so the browser prints an 80mm-wide roll receipt whose height is exactly
// the content (no A4 trailing paper). The visual design mirrors the PDF template
// (lib/receipt-pdf.ts) one-to-one — same monospace font, sections, bordered
// items table, totals and amount-in-words — only the OUTPUT MEDIUM differs.
//
// Why HTML and not the PDF for printing: a PDF page can't be resized by CSS, so
// the browser prints it onto the printer's default paper (A4) and ejects a full
// blank sheet on a roll. An HTML document with `@page { size: 80mm auto }` tells
// the browser the page IS 80mm wide and only as tall as the content. The WhatsApp
// PDF (buildReceiptPdf) is already 80mm × content-height and is left unchanged.
import type { ReceiptData } from "./receipt";
import { amountToWords } from "./number-to-words";

// Thermal roll width. Default 80mm (printable ≈ 72mm). Switch to 58 for a 58mm
// roll later without touching anything else — page + container both read this.
export const RECEIPT_WIDTH_MM = 80;
// Side padding so ink stays off the edge; content width ≈ width − 2×padding.
const SIDE_PAD_MM = 3.5;

const PKR = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");
const NUM = (n: number) => Math.round(n).toLocaleString("en-PK");

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Render the receipt as a self-contained HTML document sized for the roll. */
export function receiptHtml(d: ReceiptData): string {
  const rows = d.items
    .map((it, i) => {
      const name = esc(it.name + (it.label ? ` (${it.label})` : ""));
      const qty = esc(`${it.qty} ${(it.unit || "Pcs").trim()}`.trim());
      // Rate     = the actual (pre-discount) unit price.
      // Dis Rate = the discounted unit price actually charged (Rate when no disc).
      // Total    = Qty × Dis Rate = the net amount paid for the line.
      const lineDisc = Number(it.discount) || 0;
      const disRate = it.qty > 0 ? it.unit_price - lineDisc / it.qty : it.unit_price;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${name}</td>
        <td>${qty}</td>
        <td class="r">${esc(NUM(it.unit_price))}</td>
        <td class="r">${esc(NUM(disRate))}</td>
        <td class="r">${esc(NUM(it.line_total))}</td>
      </tr>`;
    })
    .join("");

  const taxRow = d.tax > 0 ? `<div class="ln r">Tax (${esc(d.tax_percent)}%): ${esc(PKR(d.tax))}</div>` : "";
  const payRow = d.payments.length
    ? `<div class="ln s7">Payment: ${esc(d.payments.map((p) => p.method).join(", "))}</div>`
    : "";
  const logo = d.store.logo_url
    ? `<div class="center"><img class="logo" src="${esc(d.store.logo_url)}" alt="" /></div>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(d.receipt_no)}</title>
<style>
  /* Fix the printed page to the roll width; height follows the content. */
  @page { size: ${RECEIPT_WIDTH_MM}mm auto; margin: 0; }
  /* Every element on the receipt is the SAME heavy bold weight + pure black — no
     thin or grey text anywhere, including the item rows and the totals. */
  * { box-sizing: border-box; font-weight: 700; color: #000; -webkit-text-stroke: 0.3px #000; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: #000;
    width: ${RECEIPT_WIDTH_MM}mm;            /* page is the roll width; height follows content */
    /* Stop the browser lightening near-black ink when printing to thermal. */
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* The receipt is the only flow content — width = roll, height = content (no A4),
     no fixed/min height or trailing space. */
  .receipt {
    width: ${RECEIPT_WIDTH_MM}mm;
    /* No top padding so the receipt starts at the very top of the roll — no
       leading blank space above the header. */
    padding: 0 ${SIDE_PAD_MM}mm 3mm;
    font-family: "Courier New", Courier, monospace;
    color: #000;
    font-size: 8pt;
    line-height: 1.25;
    /* Uniform heavy weight; the faux-bold text-shadow + text-stroke thicken every
       glyph so the small body / table text prints as dark and heavy as the
       store-name heading on the thermal head. Does NOT affect layout / height. */
    font-weight: 700;
    text-shadow: 0.35px 0 0 currentColor, -0.35px 0 0 currentColor;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .center { text-align: center; }
  .r { text-align: right; }
  .c { text-align: center; }
  .logo { max-width: 34mm; max-height: 18mm; object-fit: contain; }
  .shop { font-weight: 700; font-size: 11pt; }
  .s7 { font-size: 7pt; }
  .title { font-weight: 700; font-size: 12pt; margin-top: 2mm; }
  .ln { margin: 0; }
  .row { display: flex; justify-content: space-between; gap: 4mm; }
  .gap { height: 2mm; }
  table { width: 100%; border-collapse: collapse; font-size: 7pt; margin-top: 1mm; table-layout: fixed; }
  th, td { border: 0.4pt solid #000; padding: 0.6mm 0.8mm; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
  th { font-weight: 700; }
  col.sr { width: 5mm; } col.qty { width: 10mm; } col.rate { width: 11mm; } col.dis { width: 11mm; } col.tot { width: 12mm; }
  .total { font-weight: 700; font-size: 11pt; margin-top: 1.5mm; }
  .words { font-size: 7pt; margin-top: 0.5mm; }
  .footer { font-size: 7pt; margin-top: 2mm; }
</style>
</head>
<body>
  <div class="receipt">
    ${logo}
    <div class="center shop">${esc(d.store.name)}</div>
    ${d.store.address ? `<div class="center s7">${esc(d.store.address)}</div>` : ""}
    ${d.store.phone ? `<div class="center s7">${esc(d.store.phone)}</div>` : ""}

    <div class="center title">SALES INVOICE</div>
    <div class="center s7">${esc(d.date)}</div>
    <div class="gap"></div>

    <div class="ln">Customer: ${esc(d.customer || "Walk-in customer")}</div>
    <div class="ln">Address: ${esc(d.customer_address || "-")}</div>
    <div class="row"><span>Invoice No: ${esc(d.receipt_no)}</span><span>Page 1 of 1</span></div>

    <table>
      <colgroup><col class="sr" /><col /><col class="qty" /><col class="rate" /><col class="dis" /><col class="tot" /></colgroup>
      <thead>
        <tr><th class="c">Sr</th><th>Item Name</th><th>Qty</th><th class="r">Rate</th><th class="r">Dis Rate</th><th class="r">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="row"><span>Total:</span><span>${esc(PKR(d.subtotal))}</span></div>
    <div class="row"><span>Total Discount:</span><span>${d.discount > 0 ? `-${esc(PKR(d.discount))}` : esc(PKR(0))}</span></div>
    ${taxRow}
    <div class="row total"><span>Net Total:</span><span>${esc(PKR(d.total))}</span></div>
    <div class="words">${esc(amountToWords(d.total))}</div>
    ${payRow}
    ${d.store.footer ? `<div class="center footer">${esc(d.store.footer)}</div>` : ""}
  </div>
  <script>
    // Print as soon as content (incl. the logo image) has loaded, then close.
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 50);
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
</body>
</html>`;
}

/**
 * Open the receipt in a new window and trigger the browser print dialog. The
 * document is sized for the thermal roll (RECEIPT_WIDTH_MM, content height), so
 * the printout is a compact 80mm receipt — not a full A4 page.
 */
export function printReceiptHtml(d: ReceiptData): void {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) throw new Error("Allow pop-ups to print the receipt.");
  w.document.open();
  w.document.write(receiptHtml(d));
  w.document.close();
}
