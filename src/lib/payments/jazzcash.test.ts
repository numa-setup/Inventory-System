import { describe, it, expect } from "vitest";
import { jazzcashSecureHash, verifyJazzCashResponse } from "./jazzcash";

const salt = "s3cr3tSaltValue";

describe("jazzcashSecureHash", () => {
  const fields = {
    pp_Amount: "120000",
    pp_MerchantID: "MC12345",
    pp_TxnRefNo: "T20260101120000",
    pp_BillReference: "W-01001",
    pp_SecureHash: "",
  };

  it("returns a stable upper-case 64-char hex", () => {
    const h = jazzcashSecureHash(fields, salt);
    expect(h).toMatch(/^[0-9A-F]{64}$/);
    expect(jazzcashSecureHash(fields, salt)).toBe(h);
  });

  it("excludes empty values and pp_SecureHash itself", () => {
    const withNoise = jazzcashSecureHash({ a: "1", b: "", pp_SecureHash: "zzz" }, salt);
    const clean = jazzcashSecureHash({ a: "1" }, salt);
    expect(withNoise).toBe(clean);
  });

  it("orders values by key (not insertion order)", () => {
    const a = jazzcashSecureHash({ pp_b: "two", pp_a: "one" }, salt);
    const b = jazzcashSecureHash({ pp_a: "one", pp_b: "two" }, salt);
    expect(a).toBe(b);
  });

  it("changes when a value changes", () => {
    const h1 = jazzcashSecureHash({ x: "1" }, salt);
    const h2 = jazzcashSecureHash({ x: "2" }, salt);
    expect(h1).not.toBe(h2);
  });
});

describe("verifyJazzCashResponse", () => {
  it("accepts a correctly signed response and rejects tampering", () => {
    const signed = { pp_Amount: "120000", pp_ResponseCode: "000", pp_BillReference: "W-01001", pp_SecureHash: "" };
    signed.pp_SecureHash = jazzcashSecureHash(signed, salt);
    expect(verifyJazzCashResponse(signed, salt)).toBe(true);
    expect(verifyJazzCashResponse({ ...signed, pp_Amount: "1" }, salt)).toBe(false);
    expect(verifyJazzCashResponse({ ...signed, pp_SecureHash: "" }, salt)).toBe(false);
  });
});
