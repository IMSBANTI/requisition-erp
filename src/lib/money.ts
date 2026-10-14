import Decimal from "decimal.js";

export type LineInput = { qty: Decimal.Value; unitPrice: Decimal.Value };

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
