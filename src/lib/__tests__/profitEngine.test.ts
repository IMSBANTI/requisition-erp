import { describe, it, expect } from "vitest";
import { calculateProfitSummary, calculateVariance } from "../profitEngine";

describe("IMS Profit & Billing Engine — Golden Test Cases (TEST_CASES.md)", () => {
  it("Test Case 1 — Robi SME, Jan 2026 (Forecast / COST_PLUS_GROSSUP)", () => {
    const res = calculateProfitSummary({
      terms: {
        billingProfile: "COST_PLUS_GROSSUP",
        feeRate: 0.045,
        aitRate: 0.02,
        vatRate: 0.15,
      },
      billableCost: 3925190,
      imsInvestment: 38000,
    });

    expect(res.feeAmount).toBeCloseTo(176633.55, 2);
    expect(res.aitGrossupAmount).toBeCloseTo(82036.47, 2);
    expect(res.billExVat).toBeCloseTo(4183860.02, 2);
    expect(res.vatAmount).toBeCloseTo(627579.0, 2);
    expect(res.billWithVat).toBeCloseTo(4811439.02, 2);
    expect(res.aitDeducted).toBeCloseTo(83677.2, 2);
    expect(res.expectedInflow).toBeCloseTo(4100182.82, 2);
    expect(res.grossProfit).toBeCloseTo(174992.82, 2);
    expect(res.netProfit).toBeCloseTo(136992.82, 2);
  });

  it("Test Case 2 — Robi SME, Feb 2026 (Forecast / COST_PLUS_GROSSUP)", () => {
    const res = calculateProfitSummary({
      terms: {
        billingProfile: "COST_PLUS_GROSSUP",
        feeRate: 0.045,
        aitRate: 0.02,
        vatRate: 0.15,
      },
      billableCost: 4236264,
      imsInvestment: 38000,
    });

    expect(res.feeAmount).toBeCloseTo(190631.88, 2);
    expect(res.aitGrossupAmount).toBeCloseTo(88537.92, 2);
    expect(res.billExVat).toBeCloseTo(4515433.8, 2);
    expect(res.vatAmount).toBeCloseTo(677315.07, 2);
    expect(res.billWithVat).toBeCloseTo(5192748.87, 2);
    expect(res.aitDeducted).toBeCloseTo(90308.68, 2);
    expect(res.expectedInflow).toBeCloseTo(4425125.12, 2);
    expect(res.grossProfit).toBeCloseTo(188861.12, 2);
    expect(res.netProfit).toBeCloseTo(150861.12, 2);
  });

  it("Test Case 3 — UBL CM, Jan 2023 (Actual / COST_PLUS)", () => {
    const res = calculateProfitSummary({
      terms: {
        billingProfile: "COST_PLUS",
        feeRate: 0.08,
        aitRate: 0.012,
        vatRate: 0.15,
      },
      billableCost: 1122026.91,
      imsInvestment: 0,
    });

    expect(res.feeAmount).toBeCloseTo(89762.15, 2);
    expect(res.billExVat).toBeCloseTo(1211789.06, 2);
    expect(res.vatAmount).toBeCloseTo(181768.36, 2);
    expect(res.billWithVat).toBeCloseTo(1393557.42, 2);
    expect(res.aitDeducted).toBeCloseTo(14541.47, 2);
    expect(res.expectedInflow).toBeCloseTo(1197247.59, 2);
    expect(res.grossProfit).toBeCloseTo(75220.68, 2);
    expect(res.netProfit).toBeCloseTo(75220.68, 2);
  });

  it("Test Case 4 — Banglalink RSO, Normal Month (COMMISSION)", () => {
    const res = calculateProfitSummary({
      terms: {
        billingProfile: "COMMISSION",
        feeRate: 0.012,
        aitRate: 0.012,
        vatRate: 0.15,
      },
      billableCost: 12194964,
      imsInvestment: 0,
    });

    expect(res.feeAmount).toBeCloseTo(146339.57, 2);
    expect(res.billExVat).toBeCloseTo(12341303.57, 2);
    expect(res.vatAmount).toBeCloseTo(1851195.54, 2);
    expect(res.billWithVat).toBeCloseTo(14192499.11, 2);
    expect(res.aitDeducted).toBeCloseTo(1756.07, 2);
    expect(res.expectedInflow).toBeCloseTo(12339547.5, 2);
    expect(res.grossProfit).toBeCloseTo(144583.5, 2);
    expect(res.netProfit).toBeCloseTo(144583.5, 2);
  });

  it("Test Case 5 — DBH Office Set-up, Any Active Month (FIXED_FEE)", () => {
    const res = calculateProfitSummary({
      terms: {
        billingProfile: "FIXED_FEE",
        feeRate: 0,
        aitRate: 0.015,
        vatRate: 0.15,
        fixedMonthlyBill: 278685,
        maintenanceBudget: 7200,
        monthlyAmortization: 112627.06,
      },
      billableCost: 0,
      imsInvestment: 0,
    });

    expect(res.billExVat).toBeCloseTo(278685.0, 2);
    expect(res.vatAmount).toBeCloseTo(41802.75, 2);
    expect(res.billWithVat).toBeCloseTo(320487.75, 2);
    expect(res.aitDeducted).toBeCloseTo(4180.28, 2);
    expect(res.expectedInflow).toBeCloseTo(274504.72, 2);
    expect(res.grossProfit).toBeCloseTo(274504.72, 2);
    expect(res.netProfit).toBeCloseTo(154677.66, 2);
  });

  it("Event FIXED_QUOTE & Project >10% Variance Rule", () => {
    const evtRes = calculateProfitSummary({
      terms: {
        billingProfile: "FIXED_QUOTE",
        feeRate: 0,
        aitRate: 0.02,
        vatRate: 0.15,
        fixedMonthlyBill: 1500000, // 15 Lakh Event Client PO
      },
      billableCost: 1100000,
      imsInvestment: 50000,
    });

    expect(evtRes.billExVat).toBe(1500000);
    expect(evtRes.aitDeducted).toBe(30000);
    expect(evtRes.expectedInflow).toBe(1470000);
    expect(evtRes.grossProfit).toBe(370000);
    expect(evtRes.netProfit).toBe(320000);

    const variance = calculateVariance({
      currentTotal: 4542000,
      baselineTotal: 4120000,
      thresholdPct: 10,
      mode: "PROJECT",
    });
    expect(variance.variancePct).toBeCloseTo(10.24, 2);
    expect(variance.requiresReason).toBe(true);
  });
});
