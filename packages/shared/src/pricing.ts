// Single source of truth for POS money math, shared by the client (PaymentSheet
// / cart) and the server (checkoutSale) so they can never drift — a mismatch
// would make split payments fail the "payments must equal total" check.

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type DiscountType = "PERCENT" | "FIXED" | null | undefined;

/**
 * Per-unit discount in rupees from a product's default discount.
 * PERCENT → price × value%, FIXED → flat value. Never exceeds the price and
 * never goes negative, so the discounted price stays in [0, price].
 */
export function unitDiscount(price: number, type: DiscountType, value: number): number {
  if (!type || !value || value <= 0 || price <= 0) return 0;
  const raw = type === "PERCENT" ? (price * value) / 100 : value;
  return round2(Math.min(Math.max(raw, 0), price));
}

/** Discounted unit price after applying the default discount. */
export function discountedUnitPrice(price: number, type: DiscountType, value: number): number {
  return round2(price - unitDiscount(price, type, value));
}

export interface PriceLine {
  qty: number;
  unit_price: number;
  /** Per-line discount in rupees (clamped to the line total). */
  discount?: number;
}

export interface Totals {
  subtotal: number;   // gross, before any discount
  discount: number;   // line discounts + bill discount
  taxable: number;    // subtotal - discount
  tax: number;
  total: number;
}

export function computeTotals(lines: PriceLine[], billDiscount: number, taxPercent: number): Totals {
  let subtotal = 0;
  let lineDiscount = 0;
  for (const l of lines) {
    const gross = l.qty * l.unit_price;
    subtotal += gross;
    lineDiscount += Math.min(Math.max(l.discount ?? 0, 0), gross);
  }
  const discount = round2(lineDiscount + Math.max(billDiscount || 0, 0));
  const taxable = Math.max(round2(subtotal) - discount, 0);
  const tax = Math.round(taxable * taxPercent) / 100;
  const total = round2(taxable + tax);
  return { subtotal: round2(subtotal), discount, taxable: round2(taxable), tax, total };
}

/**
 * Net amount actually paid per unit of a sale line — the correct basis for a
 * refund. A line's stored `lineTotal` is already net of its OWN line discount;
 * this additionally spreads the bill-level discount (and any tax) proportionally
 * across lines so that Σ(qty × netUnitPaid) over every line equals the bill
 * `saleTotal`. Returns full precision (callers round the final line/total). A
 * line (or sale) that collected nothing refunds nothing.
 *
 * Refunding the pre-discount `unit_price` instead of this is the bug that made a
 * Rs 600→550 sale refund 600 and show negative net sales.
 */
export function netUnitPaid(lineTotal: number, qty: number, sumLineTotals: number, saleTotal: number): number {
  if (qty <= 0 || sumLineTotals <= 0 || saleTotal <= 0) return 0;
  return (lineTotal / qty) * (saleTotal / sumLineTotals);
}

/** Cash change = tendered − cash applied (never negative). */
export function changeDue(tendered: number, cashApplied: number): number {
  return Math.max(0, round2((tendered || 0) - (cashApplied || 0)));
}

/** True when the payments settle the bill (within a paisa of rounding). */
export function paymentsSettle(total: number, payments: { amount: number }[]): boolean {
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.abs(paid - total) <= 0.5;
}
