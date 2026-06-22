// Convert a rupee amount to words for the invoice, e.g.
//   15178 -> "Fifteen Thousand One Hundred Seventy-Eight Rs."
// International short scale (Thousand / Million / Billion), capitalised words,
// hyphenated compound tens (Twenty-One), matching the reference invoice.

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** Words for an integer 0–999 (no scale suffix). */
function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)], "Hundred");
    n %= 100;
  }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    parts.push(o ? `${t}-${ONES[o]}` : t);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

/** Words for a non-negative integer. */
export function integerToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const suffix = SCALES[scale] ? ` ${SCALES[scale]}` : "";
      groups.unshift(below1000(chunk) + suffix);
    }
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(" ");
}

/**
 * Rupee amount in words for the invoice total. Rounds to whole rupees and
 * appends "Rs." — e.g. "Fifteen Thousand One Hundred Seventy-Eight Rs.".
 * Includes paisa only when present: "... Rs. and Fifty Paisa".
 */
export function amountToWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paisa = Math.round((rounded - rupees) * 100);
  const base = `${integerToWords(rupees)} Rs.`;
  return paisa > 0 ? `${base} and ${integerToWords(paisa)} Paisa` : base;
}
