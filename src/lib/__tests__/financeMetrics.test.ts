import { describe, expect, it } from "vitest";
import {
  buildMatrixForList,
  buildMonthlyChartSeries,
  computeCustomBillPreview,
  computeProjectPeriodMetrics,
  deriveBillStatus,
  getEffectiveDisbursedAmount,
  resolveEffectiveProjectTerms,
  sumPartialDisbursedFromApprovals,
} from "@/lib/financeMetrics";
import { packCostHeadsWithMeta, ROBI_SME_COST_HEADS } from "@/lib/profitEngine";

describe("resolveEffectiveProjectTerms — Single Source of Truth", () => {
  it("preserves Robi SME 2% AIT gross-up vs 1% actual AIT from meta/fallback", () => {
    const terms = resolveEffectiveProjectTerms({
      code: "PROJ-ROBI-SME",
      kind: "PERMANENT",
      billingProfile: "COST_PLUS_GROSSUP",
      feeRate: 0.045,
      aitRate: 0.01,
      vatRate: 0.15,
      costHeads: packCostHeadsWithMeta(ROBI_SME_COST_HEADS, {
        aitGrossupRate: 0.02,
        robiSyncedV2: true,
      }),
    });

    expect(terms.aitRate).toBe(0.01);
    expect(terms.aitGrossupRate).toBe(0.02);
    expect(terms.feeRate).toBe(0.045);
  });

  it("preserves DBH Sales Officer ÷0.98 divisor & 5101.93 KAM recovery even if meta omitted", () => {
    const terms = resolveEffectiveProjectTerms({
      code: "PROJ-SALES-OFFICER",
      kind: "PERMANENT",
      feeRate: 0.07,
      aitRate: 0.01,
    });

    expect(terms.reimbursementTaxDivisor).toBe(0.98);
    expect(terms.fixedKamRecovery).toBe(5101.93);
  });

  it("falls back DBH Office maintenanceBudget & monthlyAmortization when null in DB", () => {
    const terms = resolveEffectiveProjectTerms({
      code: "PROJ-DBH",
      kind: "PERMANENT",
      billingProfile: "FIXED_FEE",
      fixedMonthlyBill: 278685,
      maintenanceBudget: null,
      monthlyAmortization: null,
    });

    expect(terms.maintenanceBudget).toBe(7200);
    expect(terms.monthlyAmortization).toBe(43514.84);
  });
});

describe("computeProjectPeriodMetrics & buildMonthlyChartSeries — Conflict Fixes", () => {
  const robiTerms = resolveEffectiveProjectTerms({
    code: "PROJ-ROBI-SME",
    kind: "PERMANENT",
  });

  const sampleReqs = [
    {
      forMonth: "2026-01",
      status: "SETTLED",
      billableCost: 4489061.18,
      imsInvestment: 38000,
      total: 4527061.18,
      disbursedAmount: 4527061.18,
    },
    {
      // Unapproved pending voucher — MUST NOT count in spend, charts, or activeMonthCount
      forMonth: "2026-11",
      status: "PENDING_HEAD",
      billableCost: 230000,
      imsInvestment: 0,
      total: 230000,
      disbursedAmount: 0,
    },
  ];

  const sampleBills = [
    {
      // Historical Jan 2026 bill had 2% AIT (not Apr+ 1%)
      forMonth: "2026-01",
      billExVat: 4784890.31,
      billWithVat: 5502623.86,
      expectedInflow: 4689192.51,
      receivedAmount: 4689192.63,
      isOpeningBalance: false,
    },
    {
      // Opening balance bill — MUST be excluded from P&L received/expected
      forMonth: "2025-12",
      billExVat: 500000,
      billWithVat: 575000,
      expectedInflow: 490000,
      receivedAmount: 490000,
      isOpeningBalance: true,
      notes: "[OPENING_BALANCE] Prior year carry-forward",
    },
  ];

  it("excludes PENDING_HEAD from spend/activeMonthCount and excludes OPENING_BALANCE from P&L", () => {
    const m = computeProjectPeriodMetrics({
      terms: robiTerms,
      requisitions: sampleReqs,
      bills: sampleBills,
      selectedMonth: "ALL",
    });

    expect(m.billableSpend).toBeCloseTo(4489061.18, 2);
    expect(m.imsSpend).toBe(38000);
    expect(m.pendingSpend).toBe(230000);
    expect(m.activeMonthCount).toBe(1);
    expect(m.receivedAmount).toBeCloseTo(4689192.63, 2);
    // Expected Inflow - Total Cost === Accrued Profit (reconciled with actual recorded bill!)
    expect(m.expectedInflow).toBeCloseTo(4689192.51, 2);
    expect(m.accruedProfit).toBeCloseTo(4689192.51 - 4527061.18, 2);
    expect(m.remainingDue).toBe(0);
    expect(m.collectionPercent).toBe(100);
  });

  it("excludes PENDING_HEAD from monthly chart series & Profit Matrix actuals", () => {
    const series = buildMonthlyChartSeries({
      requisitions: sampleReqs,
      bills: sampleBills,
      terms: robiTerms,
      kind: "PERMANENT",
    });
    expect(series.map((s) => s.month)).toEqual(["2026-01"]);

    const dbhTerms = resolveEffectiveProjectTerms({ code: "PROJ-DBH", kind: "PERMANENT" });
    const matrix = buildMatrixForList(
      [
        {
          terms: dbhTerms,
          monthlyBreakdown: [
            {
              forMonth: "2026-11",
              billableCost: 0,
              imsInvestment: 0,
              reqCount: 1, // Only a PENDING_HEAD req!
              approvedReqCount: 0,
            },
          ],
          bills: [],
        },
      ],
      "2026",
      "PROFIT",
      "2026-11"
    );
    // Nov 2026 must NOT be marked as an actual month with full FIXED_FEE profit
    expect(matrix.rows[0].cells[10].hasActual).toBe(false);
    expect(matrix.rows[0].cells[10].netProfit).toBe(0);
  });
});

describe("Partial Disbursement, Commission Override & ±10 BDT Tolerance", () => {
  it("extracts cumulative partial disbursed amounts from approval logs", () => {
    const approvals = [
      { action: "PARTIAL_DISBURSED", comment: "Paid part 1 [Partial Disbursement: Tk 10000.00 of Tk 50000.00]" },
      { action: "PARTIAL_DISBURSED", comment: "Paid part 2 [Partial Disbursement: Tk 15000.50 of Tk 50000.00]" },
    ];
    expect(sumPartialDisbursedFromApprovals(approvals)).toBe(25000.5);
    expect(
      getEffectiveDisbursedAmount({ status: "PARTIAL_PAID", total: 50000, approvals })
    ).toBe(25000.5);
    expect(
      getEffectiveDisbursedAmount({ status: "APPROVED", total: 50000, approvals: [] })
    ).toBe(0);
  });

  it("applies COMMISSION AIT only on commission portion for custom bill override", () => {
    const preview = computeCustomBillPreview({
      terms: {
        billingProfile: "COMMISSION",
        feeRate: 0.012,
        aitRate: 0.012,
        vatRate: 0.15,
      },
      billableCost: 1000000,
      imsInvestment: 0,
      customBillExVat: 1015000,
    });
    // Commission = 15,000 -> AIT = 1.2% of 15,000 = 180.00 (not 1.2% of 1,015,000)
    expect(preview.aitDeducted).toBe(180);
    expect(preview.expectedInflow).toBe(1014820);
  });

  it("treats payments within ±10 BDT tolerance as Paid with 0 outstanding", () => {
    const derived = deriveBillStatus(
      {
        status: "PARTIAL_PAID",
        expectedInflow: 100000,
        receivedAmount: 99991,
        submittedAt: "2026-10-01",
        dueDate: "2026-10-31",
      },
      "2026-11-10"
    );
    expect(derived.code).toBe("PAID");
    expect(derived.outstanding).toBe(0);
  });
});
