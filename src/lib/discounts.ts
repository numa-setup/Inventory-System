// Shared promotions engine — the single source of truth for time-bound
// discounts, category sales, coupon codes, Buy-X-Get-Y and free delivery.
// Used by the POS (client preview + server checkout) and the storefront
// (sale badges + checkout) so the discount a customer sees always matches the
// discount that is charged and recorded.
//
// This is DIFFERENT from a product's per-variant "default discount" (its
// everyday discounted price, handled in lib/pricing.ts). Promotions here are
// scheduled, scoped campaigns layered on top of the line price.

import { round2 } from "./pricing";

export type DiscountKind = "PERCENT" | "FIXED" | "BOGO" | "FREE_DELIVERY";
export type DiscountScope = "PRODUCT" | "CATEGORY" | "CART";

export interface Promotion {
  id: string;
  name: string;
  type: DiscountKind;
  value: number;
  scope: DiscountScope;
  code: string | null;
  min_amount: number;
  /** Product id (PRODUCT scope) or category id (CATEGORY scope). */
  target_id: string | null;
  buy_qty: number;
  get_qty: number;
  get_discount_percent: number;
  start_at: string | null;
  end_at: string | null;
  active: boolean;
}

export interface PromoLine {
  /** Stable key for this line (variant_id in POS, product_id on the web). */
  key: string;
  product_id: string;
  /** The product's category chain (own id + parent id) for category matching. */
  category_ids: string[];
  qty: number;
  unit_price: number;
}

export interface AppliedPromo {
  discount_id: string;
  name: string;
  scope: DiscountScope;
  type: DiscountKind;
  amount: number;
}

export interface PromoResult {
  /** Promo rupees off each line, keyed by PromoLine.key. */
  lineDiscount: Map<string, number>;
  /** Rupees off the whole bill (CART-scope promos). */
  cartDiscount: number;
  freeDelivery: boolean;
  applied: AppliedPromo[];
  /** lineDiscount + cartDiscount (does not include the free-delivery value). */
  totalDiscount: number;
}

/** Is a promotion live right now (active + within its optional schedule)? */
export function isLive(d: Promotion, now: Date = new Date()): boolean {
  if (!d.active) return false;
  if (d.start_at && new Date(d.start_at) > now) return false;
  if (d.end_at && new Date(d.end_at) < now) return false;
  return true;
}

function matchesLine(d: Promotion, line: PromoLine): boolean {
  if (d.scope === "CART") return false;
  if (d.scope === "PRODUCT") return d.target_id === line.product_id;
  if (d.scope === "CATEGORY") return !!d.target_id && line.category_ids.includes(d.target_id);
  return false;
}

/** Rupees off a single matched line for a PERCENT/FIXED/BOGO promo. */
function lineAmount(d: Promotion, line: PromoLine): number {
  const gross = line.qty * line.unit_price;
  if (gross <= 0) return 0;
  if (d.type === "PERCENT") return round2(Math.min((gross * d.value) / 100, gross));
  if (d.type === "FIXED") return round2(Math.min(d.value, gross)); // flat amount off this line
  if (d.type === "BOGO") {
    const block = Math.max(1, d.buy_qty) + Math.max(1, d.get_qty);
    const freeUnits = Math.floor(line.qty / block) * Math.max(1, d.get_qty);
    const pct = d.get_discount_percent > 0 ? d.get_discount_percent : 100;
    return round2(Math.min(freeUnits * line.unit_price * (pct / 100), gross));
  }
  return 0;
}

/**
 * Compute every promotion that applies to a cart.
 * - Automatic promos (no code) always apply when in schedule.
 * - Coupon promos apply only when their code equals the entered couponCode.
 * - CART / FREE_DELIVERY / coupon promos respect min_amount against the subtotal.
 * Each line's total promo is clamped to its gross so a line can never go negative.
 */
export function computePromotions(
  lines: PromoLine[],
  promotions: Promotion[],
  opts: { couponCode?: string | null; now?: Date } = {},
): PromoResult {
  const now = opts.now ?? new Date();
  const coupon = (opts.couponCode ?? "").trim().toLowerCase();
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unit_price, 0));

  const lineDiscount = new Map<string, number>();
  const applied: AppliedPromo[] = [];
  let cartDiscount = 0;
  let freeDelivery = false;

  const live = promotions.filter((d) => isLive(d, now));

  for (const d of live) {
    // A coupon promo only fires when its code was entered.
    if (d.code) {
      if (!coupon || d.code.trim().toLowerCase() !== coupon) continue;
    }
    // Bill-level gates respect the minimum cart amount.
    const gatedByMin = d.scope === "CART" || d.type === "FREE_DELIVERY" || !!d.code;
    if (gatedByMin && subtotal < (d.min_amount || 0)) continue;

    if (d.type === "FREE_DELIVERY") {
      freeDelivery = true;
      applied.push({ discount_id: d.id, name: d.name, scope: d.scope, type: d.type, amount: 0 });
      continue;
    }

    if (d.scope === "CART") {
      const amt = d.type === "PERCENT" ? round2(Math.min((subtotal * d.value) / 100, subtotal)) : round2(Math.min(d.value, subtotal));
      if (amt > 0) { cartDiscount = round2(cartDiscount + amt); applied.push({ discount_id: d.id, name: d.name, scope: d.scope, type: d.type, amount: amt }); }
      continue;
    }

    // PRODUCT / CATEGORY (incl. BOGO): per matching line.
    let total = 0;
    for (const l of lines) {
      if (!matchesLine(d, l)) continue;
      const gross = l.qty * l.unit_price;
      const already = lineDiscount.get(l.key) ?? 0;
      const room = Math.max(gross - already, 0);
      const amt = Math.min(lineAmount(d, l), room);
      if (amt > 0) { lineDiscount.set(l.key, round2(already + amt)); total = round2(total + amt); }
    }
    if (total > 0) applied.push({ discount_id: d.id, name: d.name, scope: d.scope, type: d.type, amount: total });
  }

  const lineTotal = [...lineDiscount.values()].reduce((s, n) => s + n, 0);
  return { lineDiscount, cartDiscount, freeDelivery, applied, totalDiscount: round2(lineTotal + cartDiscount) };
}

/**
 * Best automatic PRODUCT/CATEGORY sale price for ONE product (for storefront
 * sale badges). Ignores coupons and cart-level promos. Returns the lowest
 * resulting unit price plus the promo that produced it.
 */
export function productSalePrice(
  product: { product_id: string; category_ids: string[]; price: number },
  promotions: Promotion[],
  now: Date = new Date(),
): { price: number; compareAt: number | null; label: string | null } {
  const line: PromoLine = { key: product.product_id, product_id: product.product_id, category_ids: product.category_ids, qty: 1, unit_price: product.price };
  let best = 0;
  let label: string | null = null;
  for (const d of promotions) {
    if (!isLive(d, now)) continue;
    if (d.code) continue;                       // coupons aren't shown as a public sale price
    if (d.type === "FREE_DELIVERY") continue;
    if (d.scope === "CART") continue;
    if (!matchesLine(d, line)) continue;
    const amt = lineAmount(d, line);
    if (amt > best) {
      best = amt;
      label = d.type === "PERCENT" ? `${Math.round(d.value)}% off` : d.type === "BOGO" ? "Buy 1 Get 1" : "Sale";
    }
  }
  if (best <= 0) return { price: round2(product.price), compareAt: null, label: null };
  return { price: round2(product.price - best), compareAt: round2(product.price), label };
}
