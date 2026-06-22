import { describe, it, expect } from "vitest";
import { integerToWords, amountToWords } from "./number-to-words";

describe("integerToWords", () => {
  it("handles zero and single digits", () => {
    expect(integerToWords(0)).toBe("Zero");
    expect(integerToWords(7)).toBe("Seven");
  });
  it("hyphenates compound tens", () => {
    expect(integerToWords(21)).toBe("Twenty-One");
    expect(integerToWords(78)).toBe("Seventy-Eight");
  });
  it("handles hundreds and thousands", () => {
    expect(integerToWords(100)).toBe("One Hundred");
    expect(integerToWords(15178)).toBe("Fifteen Thousand One Hundred Seventy-Eight");
  });
  it("handles millions", () => {
    expect(integerToWords(2_000_500)).toBe("Two Million Five Hundred");
  });
});

describe("amountToWords (invoice total)", () => {
  it("matches the reference wording", () => {
    expect(amountToWords(15178)).toBe("Fifteen Thousand One Hundred Seventy-Eight Rs.");
  });
  it("rounds and appends Rs.", () => {
    expect(amountToWords(250)).toBe("Two Hundred Fifty Rs.");
  });
  it("includes paisa when present", () => {
    expect(amountToWords(99.5)).toBe("Ninety-Nine Rs. and Fifty Paisa");
  });
});
