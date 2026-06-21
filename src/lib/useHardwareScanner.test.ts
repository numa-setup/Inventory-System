import { describe, it, expect } from "vitest";
import { normalizeScan } from "./useHardwareScanner";

describe("normalizeScan", () => {
  it("strips CR/LF/Tab and surrounding whitespace the scanner adds", () => {
    expect(normalizeScan("5449000000996\r\n")).toBe("5449000000996");
    expect(normalizeScan("\t5449000000996\t")).toBe("5449000000996");
    expect(normalizeScan("  8964000201022  ")).toBe("8964000201022");
    expect(normalizeScan("123\n456")).toBe("123456");
  });

  it("leaves a clean code untouched", () => {
    expect(normalizeScan("2300000000001")).toBe("2300000000001");
  });
});
