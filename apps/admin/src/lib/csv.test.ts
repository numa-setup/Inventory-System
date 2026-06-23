import { describe, it, expect } from "vitest";
import { parseCsv, parseProductCsv, buildProductCsvTemplate, PRODUCT_IMPORT_COLUMNS } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    const text = 'a,b\r\n"x,y","he said ""hi"""\n,z';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x,y", 'he said "hi"'],
      ["", "z"],
    ]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a\n\n\nb")).toEqual([["a"], ["b"]]);
  });
});

describe("parseProductCsv", () => {
  it("maps flexible headers to product rows", () => {
    const rows = parseProductCsv("Product,SKU,Barcode,Sale Price,Cost,Quantity\nSugar 1kg,GRO-1,,180,150,40");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Sugar 1kg", sku: "GRO-1", barcode: undefined, price: 180, cost: 150, qty: 40 });
  });
  it("defaults missing numeric cells to 0 and ignores a header-only file", () => {
    expect(parseProductCsv("name,sku\n")).toEqual([]);
    const rows = parseProductCsv("name,sku\nTea,TEA-1");
    expect(rows[0]).toMatchObject({ name: "Tea", sku: "TEA-1", price: 0, cost: 0, qty: 0 });
  });
});

describe("buildProductCsvTemplate", () => {
  it("produces a template the parser reads back with no column drift", () => {
    const rows = parseProductCsv(buildProductCsvTemplate());
    // Exactly one sample row, every column recognised end to end.
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe("Maybelline SuperStay Lipstick");
    expect(r.brand).toBe("Maybelline");
    expect(r.category).toBe("Beauty");
    expect(r.sub_category).toBe("Lipstick");
    expect(r.sku).toBe("MBL-SS-RUBY");
    expect(r.barcode).toBe("8901234567890");
    expect(r.unit).toBe("pcs");
    expect(r.cost).toBe(450);
    expect(r.price).toBe(699);
    expect(r.discount_type).toBe("PERCENT");
    expect(r.discount_value).toBe(10);
    expect(r.qty).toBe(24);
    expect(r.low_stock).toBe(5);
    expect(r.status).toBe("active");
    expect(r.image_url).toMatch(/^https?:\/\//);
  });
  it("covers every Add-Product field and populates required columns", () => {
    const headers = PRODUCT_IMPORT_COLUMNS.map((c) => c.header);
    for (const field of ["name", "brand", "category", "sub_category", "sku", "barcode", "unit", "cost", "price", "discount_type", "discount_value", "opening_stock", "low_stock", "status", "description", "image_url"]) {
      expect(headers).toContain(field);
    }
    for (const c of PRODUCT_IMPORT_COLUMNS) {
      if (c.required) expect(c.example.length).toBeGreaterThan(0);
    }
  });
});
