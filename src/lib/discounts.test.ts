import { describe, it, expect } from "vitest";
import { computePromotions, productSalePrice, isLive, type Promotion, type PromoLine } from "./discounts";

const base: Omit<Promotion, "id" | "name" | "type" | "value" | "scope"> = {
  code: null, min_amount: 0, target_id: null, buy_qty: 1, get_qty: 1,
  get_discount_percent: 100, start_at: null, end_at: null, active: true,
};
const promo = (p: Partial<Promotion> & Pick<Promotion, "type" | "scope">): Promotion =>
  ({ id: p.id ?? "d1", name: p.name ?? "Promo", value: p.value ?? 0, ...base, ...p });

const line = (p: Partial<PromoLine> & Pick<PromoLine, "key" | "product_id">): PromoLine =>
  ({ category_ids: [], qty: 1, unit_price: 100, ...p });

describe("isLive", () => {
  it("respects active + schedule window", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    expect(isLive(promo({ type: "PERCENT", scope: "CART", active: false }), now)).toBe(false);
    expect(isLive(promo({ type: "PERCENT", scope: "CART", start_at: "2026-06-21T00:00:00Z" }), now)).toBe(false);
    expect(isLive(promo({ type: "PERCENT", scope: "CART", end_at: "2026-06-19T00:00:00Z" }), now)).toBe(false);
    expect(isLive(promo({ type: "PERCENT", scope: "CART" }), now)).toBe(true);
  });
});

describe("computePromotions", () => {
  it("applies a cart percentage", () => {
    const r = computePromotions([line({ key: "v1", product_id: "p1", qty: 2 })], [promo({ type: "PERCENT", scope: "CART", value: 10 })]);
    expect(r.cartDiscount).toBe(20); // 10% of 200
    expect(r.totalDiscount).toBe(20);
  });

  it("respects min cart amount", () => {
    const r = computePromotions([line({ key: "v1", product_id: "p1" })], [promo({ type: "FIXED", scope: "CART", value: 50, min_amount: 500 })]);
    expect(r.totalDiscount).toBe(0);
  });

  it("only applies a coupon when its code is entered", () => {
    const d = [promo({ type: "PERCENT", scope: "CART", value: 20, code: "EID20" })];
    expect(computePromotions([line({ key: "v1", product_id: "p1" })], d).totalDiscount).toBe(0);
    expect(computePromotions([line({ key: "v1", product_id: "p1" })], d, { couponCode: "eid20" }).totalDiscount).toBe(20);
  });

  it("applies a product sale to matching lines only", () => {
    const lines = [line({ key: "v1", product_id: "p1", qty: 1 }), line({ key: "v2", product_id: "p2", qty: 1 })];
    const r = computePromotions(lines, [promo({ type: "PERCENT", scope: "PRODUCT", value: 50, target_id: "p1" })]);
    expect(r.lineDiscount.get("v1")).toBe(50);
    expect(r.lineDiscount.get("v2")).toBeUndefined();
  });

  it("applies a category sale via the category chain", () => {
    const lines = [line({ key: "v1", product_id: "p1", category_ids: ["sub", "parent"] })];
    const r = computePromotions(lines, [promo({ type: "PERCENT", scope: "CATEGORY", value: 10, target_id: "parent" })]);
    expect(r.lineDiscount.get("v1")).toBe(10);
  });

  it("computes Buy-1-Get-1 free", () => {
    const r = computePromotions(
      [line({ key: "v1", product_id: "p1", qty: 2, unit_price: 100 })],
      [promo({ type: "BOGO", scope: "PRODUCT", target_id: "p1", buy_qty: 1, get_qty: 1, get_discount_percent: 100 })],
    );
    expect(r.lineDiscount.get("v1")).toBe(100); // one of two units free
  });

  it("flags free delivery", () => {
    const r = computePromotions([line({ key: "v1", product_id: "p1" })], [promo({ type: "FREE_DELIVERY", scope: "CART" })]);
    expect(r.freeDelivery).toBe(true);
  });

  it("never discounts a line below zero", () => {
    const r = computePromotions(
      [line({ key: "v1", product_id: "p1", qty: 1, unit_price: 100 })],
      [promo({ type: "FIXED", scope: "PRODUCT", target_id: "p1", value: 999 })],
    );
    expect(r.lineDiscount.get("v1")).toBe(100);
  });
});

describe("productSalePrice", () => {
  it("returns sale price + label for a matching product percentage", () => {
    const s = productSalePrice({ product_id: "p1", category_ids: [], price: 200 }, [promo({ type: "PERCENT", scope: "PRODUCT", value: 25, target_id: "p1" })]);
    expect(s.price).toBe(150);
    expect(s.compareAt).toBe(200);
    expect(s.label).toBe("25% off");
  });

  it("ignores coupon promos for the public price", () => {
    const s = productSalePrice({ product_id: "p1", category_ids: [], price: 200 }, [promo({ type: "PERCENT", scope: "PRODUCT", value: 25, target_id: "p1", code: "SECRET" })]);
    expect(s.compareAt).toBeNull();
  });
});
