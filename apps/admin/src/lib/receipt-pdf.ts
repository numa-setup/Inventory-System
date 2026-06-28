import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { type ReceiptData, receiptItemName } from "./receipt";
import { amountToWords } from "./number-to-words";

// Logo box at the top of the invoice header (keeps aspect ratio inside it).
const LOGO_MAX_W = 96;
const LOGO_MAX_H = 50;

/**
 * Fetch the store logo and embed it. pdf-lib only handles PNG/JPEG, so WebP/AVIF
 * (or any fetch/CORS failure) just returns null and the receipt falls back to the
 * text-only header — the invoice never breaks because of a logo.
 */
async function loadLogo(doc: PDFDocument, url?: string): Promise<{ img: PDFImage; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpg) return null; // WebP/AVIF/etc. unsupported by pdf-lib
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const scale = Math.min(LOGO_MAX_W / img.width, LOGO_MAX_H / img.height, 1);
    return { img, w: img.width * scale, h: img.height * scale };
  } catch {
    return null;
  }
}

const PKR = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");
const NUM = (n: number) => Math.round(n).toLocaleString("en-PK");
// pdf-lib StandardFonts are Latin-1 only — drop anything outside that range.
const safe = (s: string) => (s ?? "").replace(/[^\x20-\xFF]/g, "");

// Thermal (80mm ≈ 226pt) receipt width — the size the system already uses.
const W = 226;
const M = 10; // page margin
const INK = rgb(0, 0, 0);
const GRID = rgb(0, 0, 0);

// Bordered items table columns (left edge x, width). Sum of widths == usable.
const USABLE = W - M * 2; // 206pt
const COL = {
  sr: 12,
  name: USABLE - 12 - 24 - 26 - 26 - 28 - 28, // flexible name column = 62pt
  qty: 24, // fits "2 Pcs" / "10 Kg" without touching the Rate gridline
  rate: 26,
  disc: 26,
  dRate: 28, // wide enough for the "D.Rate" header
  total: 28,
};

/** Greedy word-wrap (with hard char-split for over-long words). */
function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxW;
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (fits(trial)) { cur = trial; continue; }
    if (cur) { lines.push(cur); cur = ""; }
    if (!fits(w)) {
      let chunk = "";
      for (const ch of w) {
        if (fits(chunk + ch)) chunk += ch;
        else { if (chunk) lines.push(chunk); chunk = ch; }
      }
      cur = chunk;
    } else cur = w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

interface Ctx {
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
  y: number;
}

// Every text helper defaults to bold: the entire invoice — including item rows —
// prints in the bold cut, pure black (INK). Nothing on the receipt is thin/light.
function text(ctx: Ctx, s: string, x: number, size: number, bold = true) {
  ctx.page.drawText(safe(s), { x, y: ctx.y - size, size, font: bold ? ctx.bold : ctx.reg, color: INK });
}
function center(ctx: Ctx, s: string, size: number, bold = true) {
  const font = bold ? ctx.bold : ctx.reg;
  const w = font.widthOfTextAtSize(safe(s), size);
  text(ctx, s, (W - w) / 2, size, bold);
}
function right(ctx: Ctx, s: string, rightEdge: number, size: number, bold = true) {
  const font = bold ? ctx.bold : ctx.reg;
  const w = font.widthOfTextAtSize(safe(s), size);
  text(ctx, s, rightEdge - w, size, bold);
}
function hline(ctx: Ctx, y: number, x1 = M, x2 = W - M, thickness = 0.6) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: GRID });
}
function vline(ctx: Ctx, x: number, y1: number, y2: number, thickness = 0.6) {
  ctx.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: GRID });
}

/**
 * Build the SALES INVOICE PDF used for BOTH Print/Download and WhatsApp — one
 * identical document. Sized for the 80mm thermal width the system uses, in the
 * system invoice font (monospace). Matches the reference layout:
 *   shop header · SALES INVOICE + date/time · Customer/Address ·
 *   Invoice No + Page X of Y · bordered Sr/Item/Qty/Rate/Total table ·
 *   TOTAL + amount in words · footer.
 */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Courier's regular cut prints faint on thermal; use the bold cut for body text
  // too. Courier and CourierBold share identical fixed-pitch metrics, so every
  // width/centering calculation — and the whole layout — is unchanged; only the
  // stroke weight darkens for crisp, legible output (parity with the print HTML).
  const reg = await doc.embedFont(StandardFonts.CourierBold);
  const bold = await doc.embedFont(StandardFonts.CourierBold);
  const logo = await loadLogo(doc, d.store.logo_url);

  // Column x positions
  const xSr = M;
  const xName = xSr + COL.sr;
  const xQty = xName + COL.name;
  const xRate = xQty + COL.qty;
  const xDisc = xRate + COL.rate;
  const xDRate = xDisc + COL.disc;
  const xTotal = xDRate + COL.dRate;
  const xEnd = xTotal + COL.total; // == W - M

  const BODY = 7; // table body / detail font
  const ROWLH = 8.5; // wrapped line height inside a row
  const PAD = 3; // vertical cell padding

  // ---- Pre-measure the rows so the page height is exact ----
  const rows = d.items.map((it, i) => {
    const name = receiptItemName(it);
    const nameLines = wrap(reg, BODY, name, COL.name - 6);
    // Rate = pre-discount unit price (R); Disc = total line discount (d×q);
    // D.Rate = discounted unit price (R − d); Total = (R − d)×q = after-discount
    // line total. Derived from unit_price/discount/qty so it is correct whether
    // line_total is gross (POS) or net (saved bill) — display only.
    const lineDisc = Number(it.discount) || 0;
    const dRate = it.qty > 0 ? it.unit_price - lineDisc / it.qty : it.unit_price;
    const lineNet = it.unit_price * it.qty - lineDisc;
    return {
      sr: String(i + 1),
      nameLines,
      qty: `${it.qty} ${(it.unit || "Pcs").trim()}`.trim(),
      rate: NUM(it.unit_price),
      disc: NUM(lineDisc),
      dRate: NUM(dRate),
      total: NUM(lineNet),
      h: PAD * 2 + Math.max(1, nameLines.length) * ROWLH,
    };
  });

  // Totals from the bill's own figures (include bill-level discounts):
  //   Total = subtotal · Total Discount = discount · Net Total = total.
  const grandTotal = d.subtotal;
  const totalDiscount = d.discount;
  const netTotal = d.total;

  const wordsLines = wrap(reg, 7, amountToWords(d.total), USABLE - 4);

  // Section heights (top → bottom). A small top margin keeps the header close to
  // the top edge — no large blank band above the invoice.
  const TOP = 4; // top margin (smaller than the side/bottom margin M)
  let h = TOP;
  if (logo) h += logo.h + 6; // logo + gap
  h += 14; // shop name
  if (d.store.address) h += 9;
  if (d.store.phone) h += 9;
  h += 8; // gap
  h += 16; // SALES INVOICE
  h += 11; // date/time
  h += 8; // gap
  h += 11; // Customer
  h += 11; // Address
  h += 11; // Invoice No / Page
  h += 6; // gap
  const headerRowH = PAD * 2 + ROWLH; // table header
  h += headerRowH;
  h += rows.reduce((a, r) => a + r.h, 0); // item rows
  h += 4; // gap after table
  h += 10; // Subtotal (always shown)
  h += 10; // Discount (always shown)
  if (d.tax > 0) h += 10;
  h += 14; // TOTAL
  h += wordsLines.length * 9 + 4; // amount in words
  if (d.payments.length) h += 10; // payment method
  h += 6; // gap
  if (d.store.footer) h += 9 * wrap(reg, 7, d.store.footer, USABLE).length;
  h += M; // bottom margin

  const page = doc.addPage([W, h]);
  const ctx: Ctx = { page, reg, bold, y: h - TOP };

  // ---- Shop header ----
  if (logo) {
    ctx.page.drawImage(logo.img, { x: (W - logo.w) / 2, y: ctx.y - logo.h, width: logo.w, height: logo.h });
    ctx.y -= logo.h + 6;
  }
  center(ctx, d.store.name, 11, true); ctx.y -= 14;
  if (d.store.address) { center(ctx, d.store.address, 7); ctx.y -= 9; }
  if (d.store.phone) { center(ctx, d.store.phone, 7); ctx.y -= 9; }
  ctx.y -= 8;

  // ---- Title + date/time ----
  center(ctx, "SALES INVOICE", 12, true); ctx.y -= 16;
  center(ctx, d.date, 7); ctx.y -= 11;
  ctx.y -= 8;

  // ---- Customer / Address ----
  text(ctx, `Customer: ${d.customer || "Walk-in customer"}`, M, 8); ctx.y -= 11;
  text(ctx, `Address: ${d.customer_address || "-"}`, M, 8); ctx.y -= 11;

  // ---- Invoice No / Page X of Y ----
  text(ctx, `Invoice No: ${d.receipt_no}`, M, 8);
  right(ctx, "Page 1 of 1", W - M, 8); ctx.y -= 11;
  ctx.y -= 6;

  // ---- Bordered items table ----
  const tableTop = ctx.y;
  // header row
  const headerBottom = ctx.y - headerRowH;
  text({ ...ctx, y: ctx.y - PAD }, "Sr", xSr + 2, BODY, true);
  text({ ...ctx, y: ctx.y - PAD }, "Item", xName + 3, BODY, true);
  text({ ...ctx, y: ctx.y - PAD }, "Qty", xQty + 3, BODY, true);
  right({ ...ctx, y: ctx.y - PAD }, "Rate", xRate + COL.rate - 2, BODY, true);
  right({ ...ctx, y: ctx.y - PAD }, "Disc", xDisc + COL.disc - 2, BODY, true);
  right({ ...ctx, y: ctx.y - PAD }, "D.Rate", xDRate + COL.dRate - 2, BODY, true);
  right({ ...ctx, y: ctx.y - PAD }, "Total", xTotal + COL.total - 2, BODY, true);
  ctx.y = headerBottom;

  // item rows
  for (const r of rows) {
    const rowTop = ctx.y;
    const baseY = ctx.y - PAD;
    text({ ...ctx, y: baseY }, r.sr, xSr + 2, BODY);
    r.nameLines.forEach((ln, k) => text({ ...ctx, y: baseY - k * ROWLH }, ln, xName + 3, BODY));
    text({ ...ctx, y: baseY }, r.qty, xQty + 3, BODY);
    right({ ...ctx, y: baseY }, r.rate, xRate + COL.rate - 2, BODY);
    right({ ...ctx, y: baseY }, r.disc, xDisc + COL.disc - 2, BODY);
    right({ ...ctx, y: baseY }, r.dRate, xDRate + COL.dRate - 2, BODY);
    right({ ...ctx, y: baseY }, r.total, xTotal + COL.total - 2, BODY);
    ctx.y = rowTop - r.h;
    hline(ctx, ctx.y); // row separator
  }
  const tableBottom = ctx.y;

  // table grid: outer box + header underline + verticals
  hline(ctx, tableTop, M, W - M); // top
  hline(ctx, headerBottom, M, W - M); // under header
  hline(ctx, tableBottom, M, W - M); // bottom (redundant w/ last sep, harmless)
  for (const x of [xSr, xName, xQty, xRate, xDisc, xDRate, xTotal, xEnd]) vline(ctx, x, tableTop, tableBottom);

  ctx.y = tableBottom - 4;

  // ---- Totals breakdown — Total (pre-discount) → Total Discount → Net Total ----
  // Line-derived so Total − Total Discount = Net Total exactly (matches columns).
  ctx.y -= 10; right(ctx, `Total: ${PKR(grandTotal)}`, W - M, 8);
  ctx.y -= 10; right(ctx, `Total Discount: ${totalDiscount > 0 ? `-${PKR(totalDiscount)}` : PKR(0)}`, W - M, 8);
  if (d.tax > 0) { ctx.y -= 10; right(ctx, `Tax (${d.tax_percent}%): ${PKR(d.tax)}`, W - M, 8); }
  ctx.y -= 14;
  text(ctx, "Net Total:", M, 11, true);
  right(ctx, PKR(netTotal), W - M, 11, true);
  ctx.y -= 4;

  // ---- Amount in words ----
  for (const ln of wordsLines) { ctx.y -= 9; text(ctx, ln, M, 7); }

  // ---- Payment method ----
  if (d.payments.length) {
    ctx.y -= 10;
    const methods = d.payments.map((p) => p.method).join(", ");
    text(ctx, `Payment: ${methods}`, M, 7);
  }

  // ---- Footer ----
  if (d.store.footer) {
    ctx.y -= 6;
    for (const ln of wrap(reg, 7, d.store.footer, USABLE)) { ctx.y -= 9; center(ctx, ln, 7); }
  }

  return doc.save();
}
