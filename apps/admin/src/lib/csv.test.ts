import { describe, it, expect } from "vitest";
import { parseCsv, parseProductCsv } from "./csv";

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
    expect(rows).toEqual([
      { name: "Sugar 1kg", sku: "GRO-1", barcode: undefined, price: 180, cost: 150, qty: 40 },
    ]);
  });
  it("defaults missing numeric cells to 0 and ignores a header-only file", () => {
    expect(parseProductCsv("name,sku\n")).toEqual([]);
    const rows = parseProductCsv("name,sku\nTea,TEA-1");
    expect(rows[0]).toMatchObject({ name: "Tea", sku: "TEA-1", price: 0, cost: 0, qty: 0 });
  });
});
