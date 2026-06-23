import { describe, it, expect } from "vitest";
import {
  ean13Check, isValidEan13, parseScan, generateInternalEan13,
  generateWeightTemplateEan13, encodeWeightEan13, code128Pattern,
} from "./barcode";

describe("EAN-13", () => {
  it("computes the check digit and validates real barcodes", () => {
    expect(ean13Check("544900000099")).toBe(6);
    expect(isValidEan13("5449000000996")).toBe(true); // Coca-Cola
    expect(isValidEan13("8964000201022")).toBe(true);
    expect(isValidEan13("5449000000990")).toBe(false); // wrong check digit
    expect(isValidEan13("8901000060")).toBe(false); // not 13 digits
  });
});

describe("parseScan", () => {
  it("treats a normal barcode as a plain lookup", () => {
    const p = parseScan(" 5449000000996 ");
    expect(p.isWeightEmbedded).toBe(false);
    expect(p.barcode).toBe("5449000000996");
    expect(p.lookupKey).toBe("5449000000996");
  });

  it("decodes a weight-embedded code and round-trips to its template", () => {
    const code = encodeWeightEan13(42, 1.25); // item 42, 1.250 kg
    expect(isValidEan13(code)).toBe(true);
    const p = parseScan(code);
    expect(p.isWeightEmbedded).toBe(true);
    expect(p.weight).toBeCloseTo(1.25, 3);
    expect(p.itemRef).toBe("00042");
    // the lookup key is the template stored on the variant (value zeroed)
    expect(p.lookupKey).toBe(generateWeightTemplateEan13(42));
    expect(isValidEan13(p.lookupKey)).toBe(true);
  });

  it("different package weights resolve to the same variant template", () => {
    const a = parseScan(encodeWeightEan13(42, 0.5));
    const b = parseScan(encodeWeightEan13(42, 2.137));
    expect(a.lookupKey).toBe(b.lookupKey);
    expect(b.weight).toBeCloseTo(2.137, 3);
  });
});

describe("internal codes", () => {
  it("generates valid GS1 prefix-2 EAN-13s", () => {
    expect(isValidEan13(generateInternalEan13(1000))).toBe(true);
    expect(generateInternalEan13(1000).startsWith("29")).toBe(true);
    expect(isValidEan13(generateWeightTemplateEan13(7))).toBe(true);
  });
});

describe("Code-128B", () => {
  it("encodes 'ABC' with the correct checksum and module count", () => {
    const widths = code128Pattern("ABC");
    // start(11) + 3 data(11) + checksum(11) + stop(13) = 68 modules
    expect(widths.reduce((a, b) => a + b, 0)).toBe(68);
  });
  it("produces a valid pattern for an alphanumeric SKU", () => {
    const widths = code128Pattern("GRO-SUG-1");
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w >= 1 && w <= 4)).toBe(true);
  });
});
