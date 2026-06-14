import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic, dedupes conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as PKR currency. */
export function formatPKR(amount: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a plain number with thousands separators. */
export function formatNumber(n: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits }).format(n);
}
