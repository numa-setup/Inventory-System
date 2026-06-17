import { describe, it, expect } from "vitest";
import { computeTotals, changeDue, paymentsSettle } from "./pricing";

describe("computeTotals", () => {
  it("sums a plain cart with no discount or tax", () => {
    const t = computeTotals([{ qty: 2, unit_price: 160 }, { qty: 1, unit_price: 1850 }], 0, 0);
    expect(t.subtotal).toBe(2170);
    expect(t.discount).toBe(0);
    expect(t.total).toBe(2170);
  });

  it("applies per-line and whole-bill discounts", () => {
    const t = computeTotals([{ qty: 2, unit_price: 100, discount: 30 }], 20, 0);
    expect(t.subtotal).toBe(200);
    expect(t.discount).toBe(50); // 30 line + 20 bill
    expect(t.total).toBe(150);
  });

  it("clamps a line discount to the line total", () => {
    const t = computeTotals([{ qty: 1, unit_price: 100, discount: 999 }], 0, 0);
    expect(t.discount).toBe(100);
    expect(t.total).toBe(0);
  });

  it("applies tax on the discounted amount", () => {
    const t = computeTotals([{ qty: 1, unit_price: 1000 }], 0, 17);
    expect(t.tax).toBe(170);
    expect(t.total).toBe(1170);
  });
});

describe("changeDue", () => {
  it("returns tendered minus applied cash, never negative", () => {
    expect(changeDue(1000, 850)).toBe(150);
    expect(changeDue(850, 850)).toBe(0);
    expect(changeDue(500, 850)).toBe(0);
  });
});

describe("paymentsSettle (split payments)", () => {
  it("accepts payments that sum to the total", () => {
    expect(paymentsSettle(850, [{ amount: 500 }, { amount: 350 }])).toBe(true);
  });
  it("rejects an under/over payment", () => {
    expect(paymentsSettle(850, [{ amount: 500 }])).toBe(false);
    expect(paymentsSettle(850, [{ amount: 500 }, { amount: 400 }])).toBe(false);
  });
  it("tolerates sub-paisa rounding", () => {
    expect(paymentsSettle(100.0, [{ amount: 99.7 }])).toBe(true);
  });
});
