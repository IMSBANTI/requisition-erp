import { describe, expect, it } from "vitest";
import { amountInWords, integerToWords } from "@/lib/numberToWords";
import { formatTaka, grandTotal, lineAmount } from "@/lib/money";

describe("amountInWords (Taka, Crore/Lakh)", () => {
  it("handles small numbers", () => {
    expect(integerToWords(0)).toBe("Zero");
    expect(integerToWords(7)).toBe("Seven");
    expect(integerToWords(19)).toBe("Nineteen");
    expect(integerToWords(101)).toBe("One Hundred One");
    expect(integerToWords(999)).toBe("Nine Hundred Ninety Nine");
  });
  it("uses Thousand / Lakh / Crore", () => {
    expect(integerToWords(12550)).toBe("Twelve Thousand Five Hundred Fifty");
    expect(integerToWords(1250000)).toBe("Twelve Lakh Fifty Thousand");
    expect(integerToWords(10000000)).toBe("One Crore");
    expect(integerToWords(123456789)).toBe(
      "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine",
    );
  });
  it("adds Taka, Paisa and Only", () => {
    expect(amountInWords(12550.5)).toBe("Twelve Thousand Five Hundred Fifty Taka and Fifty Paisa Only");
    expect(amountInWords("1000")).toBe("One Thousand Taka Only");
    expect(amountInWords(0.05)).toBe("Zero Taka and Five Paisa Only");
    expect(amountInWords(0)).toBe("Zero Taka Only");
  });
  it("rejects negatives", () => {
    expect(() => amountInWords(-1)).toThrow();
  });
});

describe("money", () => {
  it("computes line amounts without float errors", () => {
    expect(lineAmount({ qty: 3, unitPrice: 33.33 }).toFixed(2)).toBe("99.99");
    expect(lineAmount({ qty: "0.1", unitPrice: "0.2" }).toFixed(2)).toBe("0.02");
    expect(lineAmount({ qty: 1.5, unitPrice: 10.005 }).toFixed(2)).toBe("15.01");
  });
  it("sums totals", () => {
    expect(
      grandTotal([
        { qty: 2, unitPrice: 1500 },
        { qty: 1, unitPrice: 250.5 },
        { qty: 10, unitPrice: 0.1 },
      ]).toFixed(2),
    ).toBe("3251.50");
  });
  it("formats with Bangladeshi grouping", () => {
    expect(formatTaka(999)).toBe("999.00");
    expect(formatTaka(1250000.5)).toBe("12,50,000.50");
    expect(formatTaka(123456789)).toBe("12,34,56,789.00");
  });
});
