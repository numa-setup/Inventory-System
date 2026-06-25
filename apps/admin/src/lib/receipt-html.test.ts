import { describe, it, expect } from "vitest";
import { receiptHtml, RECEIPT_WIDTH_MM } from "./receipt-html";
import type { ReceiptData } from "./receipt";

const base: ReceiptData = {
  store: { name: "Hamza General Store", address: "Main Bazaar", phone: "0300-0000000", footer: "Thank you!" },
  receipt_no: "INV-12345678",
  date: "25 Jun 2026, 3:00 PM",
  cashier: "Owner",
  customer: "Walk-in customer",
  customer_address: "-",
  items: [{ name: "Soap", qty: 1, unit: "Pcs", unit_price: 600, line_total: 550 }],
  subtotal: 600, discount: 50, tax: 0, tax_percent: 0, total: 550,
  payments: [{ method: "CASH", amount: 550 }],
  change: 0,
};

describe("receiptHtml (80mm thermal sizing)", () => {
  it("fixes the page width to the roll and lets height auto-grow (no A4)", () => {
    const html = receiptHtml(base);
    expect(RECEIPT_WIDTH_MM).toBe(80);
    expect(html).toContain(`@page { size: ${RECEIPT_WIDTH_MM}mm auto; margin: 0; }`);
    expect(html).toContain(`width: ${RECEIPT_WIDTH_MM}mm`);
    // No fixed full-page height forcing an A4-length sheet.
    expect(html).not.toMatch(/height:\s*100(vh|%)/);
  });

  it("keeps the invoice content/design (title, items, total, words)", () => {
    const html = receiptHtml(base);
    expect(html).toContain("SALES INVOICE");
    expect(html).toContain("INV-12345678");
    expect(html).toContain("Soap");
    expect(html).toContain("Rs 550"); // total = net paid
    expect(html).toContain("Payment: CASH");
    expect(html).toContain("Thank you!");
  });

  it("grows with more items (multi-item taller than 1-item)", () => {
    const one = receiptHtml(base).length;
    const many = receiptHtml({
      ...base,
      items: Array.from({ length: 8 }, (_, i) => ({ name: `Item ${i}`, qty: 2, unit: "Pcs", unit_price: 100, line_total: 200 })),
    }).length;
    expect(many).toBeGreaterThan(one);
  });
});
