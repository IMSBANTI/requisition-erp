import Decimal from "decimal.js";

/**
 * Amount in words for Bangladeshi Taka using the Crore / Lakh system,
 * as commonly written on Bangladeshi vouchers and requisitions.
 *   12550.5   -> "Twelve Thousand Five Hundred Fifty Taka and Fifty Paisa Only"
 *   1250000   -> "Twelve Lakh Fifty Thousand Taka Only"
 */
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (r) parts.push(belowHundred(r));
  return parts.join(" ");
}

/** Integer to words using Crore/Lakh/Thousand/Hundred. Handles crores of crores recursively. */
export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error("Invalid integer");
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore) parts.push(integerToWords(crore) + " Crore");
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(belowHundred(lakh) + " Lakh");
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(belowHundred(thousand) + " Thousand");
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** Integer to words using international Billion/Million/Thousand/Hundred scale (for USD & EUR). */
export function integerToWordsInternational(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error("Invalid integer");
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const billion = Math.floor(n / 1_000_000_000);
  let rest = n % 1_000_000_000;
  if (billion) parts.push(integerToWordsInternational(billion) + " Billion");
  const million = Math.floor(rest / 1_000_000);
  rest %= 1_000_000;
  if (million) parts.push(belowThousand(million) + " Million");
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(belowThousand(thousand) + " Thousand");
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

export function amountInWords(amount: Decimal.Value, currency: "BDT" | "USD" | "EUR" | string = "BDT"): string {
  const d = new Decimal(amount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (d.isNegative()) throw new Error("Amount cannot be negative");
  const whole = d.floor().toNumber();
  const fraction = d.minus(d.floor()).times(100).round().toNumber();
  const code = (currency || "BDT").toUpperCase();

  if (code === "USD") {
    let words = integerToWordsInternational(whole) + (whole === 1 ? " US Dollar" : " US Dollars");
    if (fraction > 0) words += " and " + belowHundred(fraction) + (fraction === 1 ? " Cent" : " Cents");
    return words + " Only";
  }

  if (code === "EUR") {
    let words = integerToWordsInternational(whole) + (whole === 1 ? " Euro" : " Euros");
    if (fraction > 0) words += " and " + belowHundred(fraction) + (fraction === 1 ? " Cent" : " Cents");
    return words + " Only";
  }

  let words = integerToWords(whole) + " Taka";
  if (fraction > 0) words += " and " + belowHundred(fraction) + " Paisa";
  return words + " Only";
}
