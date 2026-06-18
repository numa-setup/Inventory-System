import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { easypaisaHash, easypaisaSucceeded } from "./easypaisa";

const key = "1234567890123456"; // 16-char AES-128 key

function decrypt(b64: string): string {
  const d = crypto.createDecipheriv("aes-128-ecb", Buffer.from(key, "utf8"), null);
  d.setAutoPadding(true);
  return Buffer.concat([d.update(Buffer.from(b64, "base64")), d.final()]).toString("utf8");
}

describe("easypaisaHash", () => {
  const fields = {
    storeId: "12345",
    amount: "100.0",
    orderRefNum: "W-01001",
    postBackURL: "https://x/r",
    merchantHashedReq: "",
  };

  it("AES-encrypts the sorted key=value string (round-trips)", () => {
    const h = easypaisaHash(fields, key);
    expect(h).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decrypt(h)).toBe("amount=100.0&orderRefNum=W-01001&postBackURL=https://x/r&storeId=12345");
  });

  it("is deterministic and value-sensitive", () => {
    expect(easypaisaHash(fields, key)).toBe(easypaisaHash(fields, key));
    expect(easypaisaHash({ ...fields, amount: "1.0" }, key)).not.toBe(easypaisaHash(fields, key));
  });
});

describe("easypaisaSucceeded", () => {
  it("accepts success codes and rejects others", () => {
    expect(easypaisaSucceeded({ status: "0000" })).toBe(true);
    expect(easypaisaSucceeded({ responseCode: "SUCCESS" })).toBe(true);
    expect(easypaisaSucceeded({ status: "0001" })).toBe(false);
    expect(easypaisaSucceeded({})).toBe(false);
  });
});
