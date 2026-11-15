import Decimal from "decimal.js";

export type LineInput = { qty: Decimal.Value; unitPrice: Decimal.Value };

export type CurrencyCode = "BDT" | "USD" | "EUR";

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  shortLabel: string;
  symbol: string;
  voucherPrefix: string;
  listPrefix: string;
  wordUnit: string;
  subUnit: string;
}

export const CURRENCY_OPTIONS: CurrencyMeta[] = [
  {
    code: "BDT",
    label: "Taka (BDT)",
    shortLabel: "Taka",
    symbol: "৳",
    voucherPrefix: "Tk.",
    listPrefix: "Tk",
    wordUnit: "Taka",
    subUnit: "Paisa",
  },
  {
    code: "USD",
    label: "Dollar (USD)",
    shortLabel: "Dollar",
    symbol: "$",
    voucherPrefix: "USD $",
    listPrefix: "USD $",
    wordUnit: "US Dollars",
    subUnit: "Cents",
  },
  {
    code: "EUR",
    label: "Euro (EUR)",
    shortLabel: "Euro",
    symbol: "€",
    voucherPrefix: "EUR €",
    listPrefix: "EUR €",
    wordUnit: "Euros",
    subUnit: "Cents",
  },
];

export function resolveCurrency(currency?: string | null, amountInWords?: string | null): CurrencyCode {
  const normalized = (currency || "").trim().toUpperCase();
  if (normalized === "USD" || normalized === "DOLLAR" || normalized === "$") return "USD";
  if (normalized === "EUR" || normalized === "EURO" || normalized === "€") return "EUR";
  if (normalized === "BDT" || normalized === "TAKA" || normalized === "TK") return "BDT";
  if (amountInWords) {
    if (/dollar/i.test(amountInWords)) return "USD";
    if (/euro/i.test(amountInWords)) return "EUR";
  }
  return "BDT";
}

export function getCurrencyMeta(currency?: string | null, amountInWords?: string | null): CurrencyMeta {
  const code = resolveCurrency(currency, amountInWords);
  return CURRENCY_OPTIONS.find((c) => c.code === code) || CURRENCY_OPTIONS[0];
}

/** Amount = Qty × Unit Price, rounded to 2 decimals (half-up). No floating point errors. */
export function lineAmount(line: LineInput): Decimal {
  return new Decimal(line.qty || 0).times(new Decimal(line.unitPrice || 0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function grandTotal(lines: LineInput[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(lineAmount(l)), new Decimal(0));
}

/** 1250000.5 -> "12,50,000.50" (Bangladeshi digit grouping) */
export function formatTaka(value: Decimal.Value): string {
  const d = new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative();
  const [int, frac] = d.abs().toFixed(2).split(".");
  let grouped = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = rest + "," + last3;
  }
  return (neg ? "-" : "") + grouped + "." + frac;
}

/** Formats numbers according to currency convention (Bangladeshi Lakh/Crore grouping for BDT, standard 3-digit grouping for USD/EUR) */
export function formatMoney(value: Decimal.Value, currency?: string | null): string {
  const code = resolveCurrency(currency);
  if (code === "BDT") return formatTaka(value);
  const d = new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative();
  const [int, frac] = d.abs().toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + "." + frac;
}

