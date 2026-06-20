import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReceiptData } from "./receipt";

const PKR = (n: number) => "Rs " + Math.round(n).toLocaleString("en-PK");
// pdf-lib StandardFonts are Latin-1 only — drop anything outside that range.
const safe = (s: string) => (s ?? "").replace(/[^\x20-\xFF]/g, "");

interface Row { l?: string; r?: string; c?: string; b?: boolean; s?: number; div?: boolean }

/**
 * Build an 80mm thermal-style receipt PDF with the same content as the printed /
 * downloaded receipt. Returns the PDF bytes.
 */
export async function buildReceiptPdf(d: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 226, M = 12, LH = 12, DIV = 8;

  const rows: Row[] = [];
  rows.push({ c: d.store.name, b: true, s: 12 });
  if (d.store.address) rows.push({ c: d.store.address, s: 7 });
  if (d.store.phone) rows.push({ c: d.store.phone, s: 7 });
  if (d.store.ntn) rows.push({ c: `NTN: ${d.store.ntn}`, s: 7 });
  if (d.store.header) rows.push({ c: d.store.header, s: 7 });
  rows.push({ div: true });
  rows.push({ l: `Receipt: ${d.receipt_no}`, s: 8 });
  rows.push({ l: d.date, s: 8 });
  rows.push({ l: `Cashier: ${d.cashier}`, s: 8 });
  if (d.customer) rows.push({ l: `Customer: ${d.customer}`, s: 8 });
  rows.push({ div: true });
  for (const it of d.items) {
    rows.push({ l: it.name + (it.label ? ` (${it.label})` : ""), s: 8 });
    rows.push({ l: `  ${it.qty} x ${PKR(it.unit_price)}`, r: PKR(it.line_total), s: 8 });
    if (it.discount && it.discount > 0) rows.push({ l: "  discount", r: "-" + PKR(it.discount), s: 7 });
  }
  rows.push({ div: true });
  rows.push({ l: "Subtotal", r: PKR(d.subtotal), s: 8 });
  if (d.discount > 0) rows.push({ l: "Discount", r: "-" + PKR(d.discount), s: 8 });
  if (d.tax > 0) rows.push({ l: `Tax (${d.tax_percent}%)`, r: PKR(d.tax), s: 8 });
  rows.push({ l: "TOTAL", r: PKR(d.total), b: true, s: 11 });
  rows.push({ div: true });
  for (const p of d.payments) rows.push({ l: p.method, r: PKR(p.amount), s: 8 });
  if (d.change > 0) rows.push({ l: "Change", r: PKR(d.change), s: 8 });
  rows.push({ div: true });
  rows.push({ c: d.store.footer || "Thank you!", s: 8 });

  const height = M * 2 + rows.reduce((h, r) => h + (r.div ? DIV : LH), 0);
  const page = doc.addPage([W, height]);
  let y = height - M;

  for (const r of rows) {
    if (r.div) {
      page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
      y -= DIV;
      continue;
    }
    const size = r.s ?? 8;
    const font = r.b ? bold : reg;
    if (r.c) {
      const t = safe(r.c);
      const w = font.widthOfTextAtSize(t, size);
      page.drawText(t, { x: (W - w) / 2, y: y - size, size, font });
    } else {
      if (r.l) page.drawText(safe(r.l), { x: M, y: y - size, size, font });
      if (r.r) {
        const t = safe(r.r);
        const w = font.widthOfTextAtSize(t, size);
        page.drawText(t, { x: W - M - w, y: y - size, size, font });
      }
    }
    y -= LH;
  }

  return doc.save();
}
