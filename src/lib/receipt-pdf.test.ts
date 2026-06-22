import { describe, it, expect } from "vitest";
import { buildReceiptPdf } from "./receipt-pdf";
import type { ReceiptData } from "./receipt";

const sample: ReceiptData = {
  store: { name: "Hamza General Store", address: "Main Bazaar, Lahore", phone: "0300-1234567", footer: "Thank you for shopping!" },
  receipt_no: "INV-12345678",
  date: "22 Jun 2026, 5:30 pm",
  cashier: "Usman",
  customer: "Ali Raza",
  customer_address: "House 12, Street 4",
  items: [
    { name: "Tapal Danedar Tea Pack With A Very Long Name", label: "200g", qty: 2, unit: "Pcs", unit_price: 540, line_total: 1080 },
    { name: "Sugar", qty: 5, unit: "Kg", unit_price: 280, discount: 50, line_total: 1400 },
  ],
  subtotal: 2480,
  discount: 50,
  tax: 0,
  tax_percent: 0,
  total: 2430,
  payments: [{ method: "CASH", amount: 2430 }],
  change: 70,
};

describe("buildReceiptPdf (SALES INVOICE)", () => {
  it("produces a valid PDF without throwing", async () => {
    const bytes = await buildReceiptPdf(sample);
    expect(bytes.length).toBeGreaterThan(500);
    // PDF magic header
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe("%PDF");
  });

  it("handles an empty/minimal sale (walk-in, no items detail)", async () => {
    const bytes = await buildReceiptPdf({
      ...sample,
      customer: null,
      customer_address: null,
      items: [{ name: "Item", qty: 1, unit: null, unit_price: 100, line_total: 100 }],
      discount: 0,
      total: 100,
    });
    expect(bytes.length).toBeGreaterThan(400);
  });
});
