// Single source of truth for POS money math, shared by the client (PaymentSheet
// / cart) and the server (checkoutSale) so they can never drift — a mismatch
// would make split payments fail the "payments must equal total" check.

export const round2 = (n: number) => Math.round(n * 100) / 100;

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

/** Cash change = tendered − cash applied (never negative). */
export function changeDue(tendered: number, cashApplied: number): number {
  return Math.max(0, round2((tendered || 0) - (cashApplied || 0)));
}

/** True when the payments settle the bill (within a paisa of rounding). */
export function paymentsSettle(total: number, payments: { amount: number }[]): boolean {
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.abs(paid - total) <= 0.5;
}
