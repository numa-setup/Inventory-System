import { describe, it, expect } from "vitest";
import { computeTotals, changeDue, paymentsSettle, netUnitPaid, round2 } from "./pricing";

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

describe("netUnitPaid (refund basis — actual amount paid, not list price)", () => {
  // The reported bug: item listed 600, sold for 550 after a Rs 50 line discount.
  // line_total = 550, qty 1, only line on the bill so saleTotal = sumLineTotals = 550.
  it("refunds the net paid (550), never the pre-discount price (600)", () => {
    const u = netUnitPaid(550, 1, 550, 550);
    expect(round2(u)).toBe(550);
    expect(round2(u)).not.toBe(600);
  });

  it("a full return of a profitable sale nets to zero (no negative sales)", () => {
    const saleTotal = 550; // what was collected
    const refund = round2(1 * netUnitPaid(550, 1, 550, saleTotal));
    expect(round2(saleTotal - refund)).toBe(0);
  });

  it("spreads a bill-level discount proportionally across lines", () => {
    // Two lines net of their own discounts: 600 and 400 (sum 1000); Rs 100 bill
    // discount → saleTotal 900. Each line's net paid scales by 900/1000 = 0.9.
    const a = netUnitPaid(600, 1, 1000, 900); // 540
    const b = netUnitPaid(400, 1, 1000, 900); // 360
    expect(round2(a)).toBe(540);
    expect(round2(b)).toBe(360);
    expect(round2(a + b)).toBe(900); // sums back to the bill total
  });

  it("partial return refunds only the returned units' net share", () => {
    // 3 units, line_total 300 (100/unit net), no bill discount, saleTotal 300.
    const perUnit = netUnitPaid(300, 3, 300, 300); // 100
    expect(round2(2 * perUnit)).toBe(200); // return 2 of 3
    expect(round2(3 * perUnit)).toBe(300); // full return = full net, never more
  });

  it("returns 0 when nothing was collected (free/fully-discounted)", () => {
    expect(netUnitPaid(0, 1, 0, 0)).toBe(0);
    expect(netUnitPaid(100, 0, 100, 100)).toBe(0);
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
