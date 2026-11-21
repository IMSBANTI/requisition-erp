import Decimal from "decimal.js";
import {
  BillingTermsInput,
  calculateProfitSummary,
  extractProjectMeta,
  getDefaultProjectTermsByCode,
  normalizeRate,
  round2,
} from "./profitEngine";

export const PAYMENT_TOLERANCE_BDT = 10;
export const OPENING_BILL_PREFIX = "[OPENING_BALANCE]";

export const APPROVED_SPEND_STATUSES = new Set([
  "APPROVED",
  "FORWARDED",
  "EXECUTED",
  "PARTIAL_PAID",
  "SETTLED",
]);

export const EXECUTED_CASH_STATUSES = new Set([
  "EXECUTED",
  "PARTIAL_PAID",
  "SETTLED",
]);

export const PENDING_APPROVAL_STATUSES = new Set([
  "SUBMITTED",
  "PENDING_HEAD",
  "PENDING_CHECKER",
  "PENDING_ACCOUNTS",
  "PENDING_DIRECTOR",
  "PENDING_MD",
]);

export const EXCLUDED_ACTIVE_STATUSES = new Set([
  "DRAFT",
  "REJECTED",
  "CANCELLED",
  "RETURNED",
]);

export function isApprovedSpendStatus(status: string | null | undefined): boolean {
  return APPROVED_SPEND_STATUSES.has(String(status || "").toUpperCase());
}

export function isExecutedCashStatus(status: string | null | undefined): boolean {
  return EXECUTED_CASH_STATUSES.has(String(status || "").toUpperCase());
}

export function isPendingApprovalStatus(status: string | null | undefined): boolean {
  return PENDING_APPROVAL_STATUSES.has(String(status || "").toUpperCase());
}

export function isExcludedActiveStatus(status: string | null | undefined): boolean {
  return EXCLUDED_ACTIVE_STATUSES.has(String(status || "").toUpperCase());
}

export function isOpeningBalanceBill(bill: {
  isOpeningBalance?: boolean;
  notes?: string | null;
}): boolean {
  return (
    Boolean(bill.isOpeningBalance) ||
    String(bill.notes || "").trim().startsWith(OPENING_BILL_PREFIX)
  );
}

export interface EffectiveProjectTerms extends BillingTermsInput {
  billingProfile: string;
  feeRate: number;
  aitRate: number;
  aitGrossupRate?: number;
  reimbursementTaxDivisor?: number;
  fixedKamRecovery?: number;
  vatRate: number;
  billCycleDays: number;
  funding: string;
  fixedMonthlyBill: number;
  maintenanceBudget: number;
  monthlyAmortization: number;
}

/**
 * Single source of truth for resolving effective billing & P&L terms for a Project/Event.
 * Used by /finance, /finance/[id], and POST /api/finance/bills so Robi SME, DBH Office,
 * DBH Sales Officer, and custom overrides never diverge.
 */
export function resolveEffectiveProjectTerms(project: {
  code?: string | null;
  kind?: string | null;
  budget?: any;
  billingProfile?: string | null;
  feeRate?: any;
  aitRate?: any;
  vatRate?: any;
  billCycleDays?: number | null;
  funding?: string | null;
  fixedMonthlyBill?: any;
  maintenanceBudget?: any;
  monthlyAmortization?: any;
  costHeads?: unknown;
}): EffectiveProjectTerms {
  const fallbackTerms = getDefaultProjectTermsByCode(
    project.code || "",
    project.kind || undefined
  );
  const meta = extractProjectMeta(project.costHeads);

  const resolvedProfile =
    project.billingProfile || String(fallbackTerms.billingProfile || "COST_PLUS");

  const effectiveFixedBill =
    project.fixedMonthlyBill !== undefined &&
    project.fixedMonthlyBill !== null &&
    Number(project.fixedMonthlyBill) > 0
      ? Number(project.fixedMonthlyBill)
      : resolvedProfile === "FIXED_QUOTE" && project.budget && Number(project.budget) > 0
      ? Number(project.budget)
      : Number(fallbackTerms.fixedMonthlyBill || 0);

  return {
    billingProfile: resolvedProfile,
    feeRate:
      project.feeRate !== undefined && project.feeRate !== null
        ? Number(project.feeRate)
        : Number(fallbackTerms.feeRate ?? 0.08),
    aitRate:
      project.aitRate !== undefined && project.aitRate !== null
        ? Number(project.aitRate)
        : Number(fallbackTerms.aitRate ?? 0.012),
    aitGrossupRate:
      meta.aitGrossupRate !== undefined && meta.aitGrossupRate !== null
        ? Number(meta.aitGrossupRate)
        : fallbackTerms.aitGrossupRate !== undefined
        ? Number(fallbackTerms.aitGrossupRate)
        : undefined,
    reimbursementTaxDivisor:
      meta.reimbursementTaxDivisor !== undefined &&
      meta.reimbursementTaxDivisor !== null
        ? Number(meta.reimbursementTaxDivisor)
        : fallbackTerms.reimbursementTaxDivisor !== undefined
        ? Number(fallbackTerms.reimbursementTaxDivisor)
        : undefined,
    fixedKamRecovery:
      meta.fixedKamRecovery !== undefined && meta.fixedKamRecovery !== null
        ? Number(meta.fixedKamRecovery)
        : fallbackTerms.fixedKamRecovery !== undefined
        ? Number(fallbackTerms.fixedKamRecovery)
        : undefined,
    vatRate:
      project.vatRate !== undefined && project.vatRate !== null
        ? Number(project.vatRate)
        : Number(fallbackTerms.vatRate ?? 0.15),
    billCycleDays:
      project.billCycleDays !== undefined && project.billCycleDays !== null
        ? Number(project.billCycleDays)
        : Number(fallbackTerms.billCycleDays ?? 30),
    funding: project.funding || String(fallbackTerms.funding || "POSTPAID"),
    fixedMonthlyBill: effectiveFixedBill,
    maintenanceBudget:
      project.maintenanceBudget !== undefined && project.maintenanceBudget !== null
        ? Number(project.maintenanceBudget)
        : Number(fallbackTerms.maintenanceBudget ?? 0),
    monthlyAmortization:
      project.monthlyAmortization !== undefined && project.monthlyAmortization !== null
        ? Number(project.monthlyAmortization)
        : Number(fallbackTerms.monthlyAmortization ?? 0),
  };
}

const PARTIAL_DISB_REGEX = /\[Partial Disbursement:\s*Tk\s*([0-9,.]+)\s+of\s+Tk\s*[0-9,.]+\]/i;

/**
 * Sum partial disbursement payouts logged on Approval rows (`action === "PARTIAL_DISBURSED"`).
 */
export function sumPartialDisbursedFromApprovals(
  approvals?: Array<{ action?: string | null; comment?: string | null }> | null
): number {
  if (!Array.isArray(approvals) || approvals.length === 0) return 0;
  let total = new Decimal(0);
  for (const a of approvals) {
    if (String(a.action || "").toUpperCase() !== "PARTIAL_DISBURSED") continue;
    const match = String(a.comment || "").match(PARTIAL_DISB_REGEX);
    if (match && match[1]) {
      const cleaned = match[1].replace(/,/g, "");
      const num = Number(cleaned);
      if (Number.isFinite(num) && num > 0) {
        total = total.plus(num);
      }
    }
  }
  return round2(total).toNumber();
}

/**
 * Returns the actual cash disbursed for a requisition.
 * - EXECUTED / SETTLED: full `total` (SETTLE adjusts `total` down to settled cash).
 * - PARTIAL_PAID: cumulative partial payouts parsed from approvals, capped at `total`.
 * - Other statuses: 0.
 */
export function getEffectiveDisbursedAmount(req: {
  status?: string | null;
  total?: any;
  approvals?: Array<{ action?: string | null; comment?: string | null }> | null;
}): number {
  const status = String(req.status || "").toUpperCase();
  const fullTotal = round2(Number(req.total || 0)).toNumber();
  if (status === "EXECUTED" || status === "SETTLED") {
    return fullTotal;
  }
  if (status === "PARTIAL_PAID") {
    const partialSum = sumPartialDisbursedFromApprovals(req.approvals);
    if (partialSum > 0) {
      return Math.min(fullTotal, partialSum);
    }
    return fullTotal;
  }
  return 0;
}

export interface PeriodRequisitionInput {
  forMonth?: string | null;
  status: string;
  billableCost: number;
  imsInvestment: number;
  total: number;
  disbursedAmount?: number;
}

export interface PeriodBillInput {
  forMonth?: string | null;
  billExVat: number;
  billWithVat: number;
  expectedInflow: number;
  receivedAmount: number;
  isOpeningBalance?: boolean;
  notes?: string | null;
}

/**
 * Unified Single-Project / Single-Period P&L & Cashflow calculation used by both
 * /finance (FinanceClient) and /finance/[id] (ProjectFinanceDetailClient).
 */
export function computeProjectPeriodMetrics<
  R extends PeriodRequisitionInput,
  B extends PeriodBillInput
>(params: {
  terms: BillingTermsInput;
  requisitions: R[];
  bills: B[];
  selectedMonth: string; // "ALL" or "YYYY-MM"
}) {
  const { terms, selectedMonth } = params;

  const reqs =
    selectedMonth === "ALL"
      ? params.requisitions
      : params.requisitions.filter((r) => r.forMonth === selectedMonth);

  const bills =
    selectedMonth === "ALL"
      ? params.bills
      : params.bills.filter((b) => b.forMonth === selectedMonth);

  const pnlBills = bills.filter((b) => !isOpeningBalanceBill(b));

  const approvedReqs = reqs.filter((r) => isApprovedSpendStatus(r.status));
  const pendingReqs = reqs.filter((r) => !isApprovedSpendStatus(r.status));

  const billableSpend = round2(
    approvedReqs.reduce((sum, r) => sum + Number(r.billableCost || 0), 0)
  ).toNumber();
  const imsSpend = round2(
    approvedReqs.reduce((sum, r) => sum + Number(r.imsInvestment || 0), 0)
  ).toNumber();
  const totalSpend = round2(billableSpend + imsSpend).toNumber();

  const executedSpend = round2(
    approvedReqs.reduce((sum, r) => {
      if (r.disbursedAmount !== undefined) return sum + Number(r.disbursedAmount || 0);
      return isExecutedCashStatus(r.status) ? sum + Number(r.total || 0) : sum;
    }, 0)
  ).toNumber();

  const pendingSpend = round2(
    pendingReqs.reduce((sum, r) => sum + Number(r.total || 0), 0)
  ).toNumber();

  const invoicedBills = pnlBills.filter((b) => Number(b.billExVat || 0) > 0);

  // Active months count ONLY months with approved/executed spend OR recorded non-opening bills
  const activeMonthSet = new Set<string>([
    ...approvedReqs.map((r) => String(r.forMonth || "")).filter(Boolean),
    ...invoicedBills
      .map((b) => String(b.forMonth || ""))
      .filter((m) => m && m !== "ALL" && m !== "EVENT-TOTAL" && m !== "EVENT"),
  ]);
  const distinctMonths = Math.max(1, activeMonthSet.size);
  const periodMonthCount = selectedMonth === "ALL" ? distinctMonths : 1;

  const calc = calculateProfitSummary({
    terms,
    billableCost: billableSpend,
    imsInvestment: imsSpend,
    activeMonthCount: periodMonthCount,
  });

  const hasRecordedBills = invoicedBills.length > 0;

  const billedExVat = hasRecordedBills
    ? round2(invoicedBills.reduce((sum, b) => sum + Number(b.billExVat || 0), 0)).toNumber()
    : calc.billExVat;
  const billedWithVat = hasRecordedBills
    ? round2(invoicedBills.reduce((sum, b) => sum + Number(b.billWithVat || 0), 0)).toNumber()
    : calc.billWithVat;
  const expectedInflow = hasRecordedBills
    ? round2(invoicedBills.reduce((sum, b) => sum + Number(b.expectedInflow || 0), 0)).toNumber()
    : calc.expectedInflow;
  const aitDeducted = hasRecordedBills
    ? round2(billedExVat - expectedInflow).toNumber()
    : calc.aitDeducted;

  const receivedAmount = round2(
    pnlBills.reduce((sum, b) => sum + Number(b.receivedAmount || 0), 0)
  ).toNumber();

  const rawDue = round2(Math.max(0, expectedInflow - receivedAmount)).toNumber();
  const remainingDue = rawDue <= PAYMENT_TOLERANCE_BDT ? 0 : rawDue;
  const deviation = round2(receivedAmount - expectedInflow).toNumber();

  const totalCostWithFixed = round2(
    totalSpend + calc.amortizationCost + calc.maintenanceCost
  ).toNumber();

  // Reconcile accruedProfit with actual recorded ClientBills when present so
  // Expected Inflow - Total Cost === Accrued Profit always holds on screen.
  const accruedProfit = hasRecordedBills
    ? round2(expectedInflow - totalCostWithFixed).toNumber()
    : calc.netProfit;

  const realizedProfit = round2(receivedAmount - totalCostWithFixed).toNumber();

  const netMarginPct =
    billedExVat > 0
      ? round2(new Decimal(accruedProfit).dividedBy(billedExVat).times(100)).toNumber()
      : 0;

  const collectionPercent =
    expectedInflow > 0
      ? remainingDue === 0
        ? 100
        : Math.min(100, Math.round((receivedAmount / expectedInflow) * 100))
      : 0;

  const monthlyAvgSpend = round2(totalSpend / distinctMonths).toNumber();
  const reqWc2x = round2(monthlyAvgSpend * 2).toNumber();
  const reqWc25x = round2(monthlyAvgSpend * 2.5).toNumber();
  const annualizedNetProfit = round2((accruedProfit / distinctMonths) * 12).toNumber();
  const roi2xPct =
    reqWc2x > 0
      ? round2(new Decimal(annualizedNetProfit).dividedBy(reqWc2x).times(100)).toNumber()
      : 0;
  const roi25xPct =
    reqWc25x > 0
      ? round2(new Decimal(annualizedNetProfit).dividedBy(reqWc25x).times(100)).toNumber()
      : 0;

  return {
    reqs,
    approvedReqs,
    pendingReqs,
    bills,
    pnlBills,
    hasRecordedBills,
    billableSpend,
    imsSpend,
    totalSpend,
    totalCostWithFixed,
    executedSpend,
    pendingSpend,
    monthlyAvgSpend,
    activeMonthCount: distinctMonths,
    reqWc2x,
    reqWc25x,
    annualizedNetProfit,
    roi2xPct,
    roi25xPct,
    calc,
    billedExVat,
    billedWithVat,
    aitDeducted,
    expectedInflow,
    receivedAmount,
    remainingDue,
    deviation,
    accruedProfit,
    realizedProfit,
    netMarginPct,
    collectionPercent,
  };
}

/**
 * Decimal-safe custom bill preview (handles COMMISSION AIT on commission only).
 */
export function computeCustomBillPreview(params: {
  terms: BillingTermsInput;
  billableCost: number;
  imsInvestment: number;
  customBillExVat: number | null;
}) {
  const { terms, billableCost, imsInvestment, customBillExVat } = params;
  const baseCalc = calculateProfitSummary({
    terms,
    billableCost,
    imsInvestment,
  });

  if (
    customBillExVat !== null &&
    Number.isFinite(customBillExVat) &&
    customBillExVat >= 0
  ) {
    const exVat = round2(customBillExVat);
    const vatRate = normalizeRate(terms.vatRate, 0.15);
    const aitRate = normalizeRate(terms.aitRate, 0);
    const profile = String(terms.billingProfile || "COST_PLUS").toUpperCase();

    const vatAmt = round2(exVat.times(vatRate));
    const aitBase =
      profile === "COMMISSION"
        ? Decimal.max(0, exVat.minus(round2(billableCost)))
        : exVat;
    const aitAmt = round2(aitBase.times(aitRate));

    return {
      billableCost: round2(billableCost).toNumber(),
      imsInvestment: round2(imsInvestment).toNumber(),
      billExVat: exVat.toNumber(),
      vatAmount: vatAmt.toNumber(),
      billWithVat: round2(exVat.plus(vatAmt)).toNumber(),
      aitDeducted: aitAmt.toNumber(),
      expectedInflow: round2(exVat.minus(aitAmt)).toNumber(),
    };
  }

  return {
    billableCost: baseCalc.billableCost,
    imsInvestment: baseCalc.imsInvestment,
    billExVat: baseCalc.billExVat,
    vatAmount: baseCalc.vatAmount,
    billWithVat: baseCalc.billWithVat,
    aitDeducted: baseCalc.aitDeducted,
    expectedInflow: baseCalc.expectedInflow,
  };
}

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatShortYearMonth(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return `${SHORT_MONTH_NAMES[Number(m[2]) - 1] || m[2]} ${m[1].slice(2)}`;
}

/**
 * Build unified monthly chart series (Approved/Executed spend only, excludes OPENING_BALANCE bills,
 * reconciles expectedInflow & accruedProfit with actual recorded ClientBills when present).
 */
export function buildMonthlyChartSeries(params: {
  requisitions: Array<PeriodRequisitionInput>;
  bills: Array<PeriodBillInput>;
  terms: BillingTermsInput;
  kind?: string;
}) {
  const { requisitions, bills, terms, kind } = params;
  const map: Record<
    string,
    {
      month: string;
      billableCost: number;
      imsInvestment: number;
      totalCost: number;
      billedExpectedInflow: number;
      hasRecordedBill: boolean;
      receivedAmount: number;
    }
  > = {};

  for (const r of requisitions) {
    if (!isApprovedSpendStatus(r.status)) continue;
    const m = r.forMonth || "Overall";
    if (!map[m]) {
      map[m] = {
        month: m,
        billableCost: 0,
        imsInvestment: 0,
        totalCost: 0,
        billedExpectedInflow: 0,
        hasRecordedBill: false,
        receivedAmount: 0,
      };
    }
    map[m].billableCost += Number(r.billableCost || 0);
    map[m].imsInvestment += Number(r.imsInvestment || 0);
    map[m].totalCost += Number(r.billableCost || 0) + Number(r.imsInvestment || 0);
  }

  for (const b of bills) {
    if (isOpeningBalanceBill(b)) continue;
    const m = b.forMonth || "Overall";
    if (!map[m]) {
      map[m] = {
        month: m,
        billableCost: 0,
        imsInvestment: 0,
        totalCost: 0,
        billedExpectedInflow: 0,
        hasRecordedBill: false,
        receivedAmount: 0,
      };
    }
    if (Number(b.billExVat || 0) > 0) {
      map[m].billedExpectedInflow += Number(b.expectedInflow || 0);
      map[m].hasRecordedBill = true;
    }
    map[m].receivedAmount += Number(b.receivedAmount || 0);
  }

  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => {
      const shortMonth = formatShortYearMonth(row.month);
      if (kind === "COMPANY") {
        return {
          month: row.month,
          shortMonth,
          billableCost: round2(row.billableCost).toNumber(),
          imsInvestment: round2(row.imsInvestment).toNumber(),
          totalCost: round2(row.totalCost).toNumber(),
          receivedAmount: round2(row.receivedAmount).toNumber(),
          expectedInflow: 0,
          accruedProfit: 0,
        };
      }
      const c = calculateProfitSummary({
        terms,
        billableCost: row.billableCost,
        imsInvestment: row.imsInvestment,
      });
      const expectedInflow = row.hasRecordedBill
        ? round2(row.billedExpectedInflow).toNumber()
        : c.expectedInflow;
      const totalWithFixed = round2(
        row.billableCost + row.imsInvestment + c.amortizationCost + c.maintenanceCost
      ).toNumber();
      const accruedProfit = row.hasRecordedBill
        ? round2(expectedInflow - totalWithFixed).toNumber()
        : c.netProfit;

      return {
        month: row.month,
        shortMonth,
        billableCost: round2(row.billableCost).toNumber(),
        imsInvestment: round2(row.imsInvestment).toNumber(),
        totalCost: round2(totalWithFixed).toNumber(),
        receivedAmount: round2(row.receivedAmount).toNumber(),
        expectedInflow: Math.round(expectedInflow),
        accruedProfit: Math.round(accruedProfit),
      };
    });
}

/**
 * §4.4 Derived Bill Status & Overdue Ageing Helper
 */
export function deriveBillStatus(
  bill: {
    status: string;
    expectedInflow: number;
    receivedAmount: number;
    submittedAt: string;
    dueDate: string;
  },
  todayOverride?: string
) {
  const todayStr = todayOverride || new Date().toISOString().slice(0, 10);
  const expected = Number(bill.expectedInflow || 0);
  const received = Number(bill.receivedAmount || 0);
  const rawOutstanding = round2(Math.max(0, expected - received)).toNumber();
  const outstanding = rawOutstanding <= PAYMENT_TOLERANCE_BDT ? 0 : rawOutstanding;

  if (
    (expected > 0 && received >= expected - PAYMENT_TOLERANCE_BDT) ||
    bill.status === "PAID"
  ) {
    return {
      code: "PAID",
      label: "Paid",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      daysOverdue: 0,
      daysToDue: null as number | null,
      ageingBucket: "PAID" as const,
      outstanding: 0,
    };
  }

  let daysOverdue = 0;
  let daysToDue: number | null = null;
  if (bill.dueDate) {
    const dueMs = new Date(bill.dueDate + "T00:00:00").getTime();
    const nowMs = new Date(todayStr + "T00:00:00").getTime();
    const diffDays = Math.round((nowMs - dueMs) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      daysOverdue = diffDays;
    } else {
      daysToDue = Math.abs(diffDays);
    }
  }

  let ageingBucket:
    | "NOT_YET_DUE"
    | "DUE_SOON"
    | "OVERDUE_1_30"
    | "OVERDUE_31_60"
    | "OVERDUE_60_PLUS" = "NOT_YET_DUE";

  if (daysOverdue > 60) {
    ageingBucket = "OVERDUE_60_PLUS";
  } else if (daysOverdue > 30) {
    ageingBucket = "OVERDUE_31_60";
  } else if (daysOverdue >= 1) {
    ageingBucket = "OVERDUE_1_30";
  } else if (daysToDue !== null && daysToDue <= 7) {
    ageingBucket = "DUE_SOON";
  }

  if (received > 0 && received < expected - PAYMENT_TOLERANCE_BDT) {
    return {
      code: "PARTIAL_PAID",
      label:
        daysOverdue > 0 ? `Part-Paid (${daysOverdue}d Overdue)` : "Part-Paid",
      cls:
        daysOverdue > 0
          ? "bg-red-50 text-red-800 border-red-200"
          : "bg-amber-50 text-amber-800 border-amber-200",
      daysOverdue,
      daysToDue,
      ageingBucket,
      outstanding,
    };
  }

  if (daysOverdue > 0) {
    return {
      code: "OVERDUE",
      label: `Overdue (${daysOverdue}d)`,
      cls: "bg-red-50 text-red-800 border-red-200",
      daysOverdue,
      daysToDue,
      ageingBucket,
      outstanding,
    };
  }

  if (daysToDue !== null && daysToDue <= 7) {
    return {
      code: "DUE_SOON",
      label: daysToDue === 0 ? "Due Today" : `Due in ${daysToDue}d`,
      cls: "bg-orange-50 text-orange-800 border-orange-200",
      daysOverdue: 0,
      daysToDue,
      ageingBucket: "DUE_SOON" as const,
      outstanding,
    };
  }

  if (bill.submittedAt || bill.status === "SUBMITTED") {
    return {
      code: "SUBMITTED",
      label: "Submitted",
      cls: "bg-blue-50 text-blue-700 border-blue-200",
      daysOverdue: 0,
      daysToDue,
      ageingBucket: "NOT_YET_DUE" as const,
      outstanding,
    };
  }

  return {
    code: "DRAFT",
    label: "Unbilled / Draft",
    cls: "bg-gray-100 text-gray-700 border-gray-200",
    daysOverdue: 0,
    daysToDue,
    ageingBucket: "NOT_YET_DUE" as const,
    outstanding,
  };
}

export interface MatrixProjectLike {
  terms: BillingTermsInput;
  monthlyBreakdown: Array<{
    forMonth: string;
    billableCost: number;
    imsInvestment: number;
    reqCount: number;
    approvedReqCount?: number;
  }>;
  bills: Array<PeriodBillInput>;
  closedMonths?: Record<string, { closedAt: string; closedBy: string; noBillReason?: string }>;
  manualForecasts?: Record<
    string,
    { amount: number; note: string; updatedBy: string; updatedAt: string }
  >;
}

/**
 * Compute 12-month & quarterly P&L / Expense matrix for Management Summary Matrix.
 * Counts ONLY months with approved/executed spend or recorded non-opening bills as actuals
 * (never PENDING_HEAD / PENDING_MD requisitions), and reconciles monthly profit with actual
 * ClientBills when present.
 */
export function buildMatrixForList<T extends MatrixProjectLike>(
  list: T[],
  yearStr: string,
  mode: "PROFIT" | "EXPENSE",
  currentYearMonthOverride?: string
) {
  const currentYearMonth =
    currentYearMonthOverride || new Date().toISOString().slice(0, 7);

  const rows = list.map((p) => {
    const monthMap: Record<
      string,
      {
        billable: number;
        ims: number;
        hasApprovedSpend: boolean;
        billedExVat: number;
        billedExpectedInflow: number;
        hasRecordedBill: boolean;
      }
    > = {};

    for (const m of p.monthlyBreakdown) {
      if (m.forMonth && m.forMonth.startsWith(yearStr + "-")) {
        const hasApprovedSpend =
          m.billableCost > 0 ||
          m.imsInvestment > 0 ||
          (m.approvedReqCount !== undefined && m.approvedReqCount > 0);
        if (!hasApprovedSpend) continue;
        monthMap[m.forMonth] = {
          billable: m.billableCost,
          ims: m.imsInvestment,
          hasApprovedSpend: true,
          billedExVat: 0,
          billedExpectedInflow: 0,
          hasRecordedBill: false,
        };
      }
    }

    if (mode === "PROFIT") {
      for (const b of p.bills || []) {
        if (isOpeningBalanceBill(b)) continue;
        const mKey = b.forMonth || "";
        if (!mKey.startsWith(yearStr + "-") || Number(b.billExVat || 0) <= 0) {
          continue;
        }
        if (!monthMap[mKey]) {
          monthMap[mKey] = {
            billable: 0,
            ims: 0,
            hasApprovedSpend: false,
            billedExVat: 0,
            billedExpectedInflow: 0,
            hasRecordedBill: false,
          };
        }
        monthMap[mKey].billedExVat += Number(b.billExVat || 0);
        monthMap[mKey].billedExpectedInflow += Number(b.expectedInflow || 0);
        monthMap[mKey].hasRecordedBill = true;
      }
    }

    const actualValuesInOrder: number[] = [];
    const cells: Array<{
      monthIndex: number;
      monthKey: string;
      netProfit: number;
      billableCost: number;
      imsInvestment: number;
      billExVat: number;
      expectedInflow: number;
      isForecast: boolean;
      isManualForecast: boolean;
      manualForecastNote?: string;
      hasActual: boolean;
      isClosed: boolean;
    }> = [];

    for (let i = 0; i < 12; i++) {
      const mKey = `${yearStr}-${String(i + 1).padStart(2, "0")}`;
      const mData = monthMap[mKey];
      const isClosed = Boolean(p.closedMonths && p.closedMonths[mKey]);
      const hasData = Boolean(
        mData && (mData.hasApprovedSpend || mData.hasRecordedBill)
      );

      if (mData && hasData) {
        if (mode === "EXPENSE") {
          const totalExp = round2(mData.billable + mData.ims).toNumber();
          actualValuesInOrder.push(totalExp);
          cells.push({
            monthIndex: i,
            monthKey: mKey,
            netProfit: totalExp,
            billableCost: mData.billable,
            imsInvestment: mData.ims,
            billExVat: 0,
            expectedInflow: 0,
            isForecast: false,
            isManualForecast: false,
            hasActual: true,
            isClosed,
          });
        } else {
          const c = calculateProfitSummary({
            terms: p.terms,
            billableCost: mData.billable,
            imsInvestment: mData.ims,
          });
          const billExVat = mData.hasRecordedBill
            ? round2(mData.billedExVat).toNumber()
            : c.billExVat;
          const expectedInflow = mData.hasRecordedBill
            ? round2(mData.billedExpectedInflow).toNumber()
            : c.expectedInflow;
          const totalCost = round2(
            mData.billable + mData.ims + c.amortizationCost + c.maintenanceCost
          ).toNumber();
          const netProfit = mData.hasRecordedBill
            ? round2(expectedInflow - totalCost).toNumber()
            : c.netProfit;

          actualValuesInOrder.push(netProfit);
          cells.push({
            monthIndex: i,
            monthKey: mKey,
            netProfit,
            billableCost: mData.billable,
            imsInvestment: mData.ims,
            billExVat,
            expectedInflow,
            isForecast: false,
            isManualForecast: false,
            hasActual: true,
            isClosed,
          });
        }
      } else {
        cells.push({
          monthIndex: i,
          monthKey: mKey,
          netProfit: 0,
          billableCost: 0,
          imsInvestment: 0,
          billExVat: 0,
          expectedInflow: 0,
          isForecast: false,
          isManualForecast: false,
          hasActual: false,
          isClosed,
        });
      }
    }

    let forecastMonthlyValue: number | null = null;
    if (actualValuesInOrder.length > 0) {
      if (mode === "PROFIT" && p.terms.billingProfile === "FIXED_FEE") {
        forecastMonthlyValue =
          actualValuesInOrder[actualValuesInOrder.length - 1];
      } else {
        const last3 = actualValuesInOrder.slice(-3);
        const sum3 = last3.reduce((s, v) => s + v, 0);
        forecastMonthlyValue = Number((sum3 / last3.length).toFixed(2));
      }
    }

    for (const cell of cells) {
      const manualEntry = p.manualForecasts?.[cell.monthKey];
      if (!cell.hasActual && manualEntry !== undefined) {
        cell.netProfit = Number(manualEntry.amount || 0);
        cell.isForecast = true;
        cell.isManualForecast = true;
        cell.manualForecastNote = manualEntry.note;
      } else if (
        !cell.hasActual &&
        cell.monthKey > currentYearMonth &&
        forecastMonthlyValue !== null
      ) {
        cell.netProfit = forecastMonthlyValue;
        cell.isForecast = true;
        cell.isManualForecast = false;
      }
    }

    const actualYtd = round2(
      cells.filter((c) => c.hasActual).reduce((s, c) => s + c.netProfit, 0)
    ).toNumber();
    const totalImsYtd = round2(
      cells.filter((c) => c.hasActual).reduce((s, c) => s + c.imsInvestment, 0)
    ).toNumber();
    const totalBillableYtd = round2(
      cells.filter((c) => c.hasActual).reduce((s, c) => s + c.billableCost, 0)
    ).toNumber();

    const q1 = round2(cells[0].netProfit + cells[1].netProfit + cells[2].netProfit).toNumber();
    const q2 = round2(cells[3].netProfit + cells[4].netProfit + cells[5].netProfit).toNumber();
    const q3 = round2(cells[6].netProfit + cells[7].netProfit + cells[8].netProfit).toNumber();
    const q4 = round2(cells[9].netProfit + cells[10].netProfit + cells[11].netProfit).toNumber();
    const h1 = round2(q1 + q2).toNumber();
    const h2 = round2(q3 + q4).toNumber();
    const fullYearTotal = round2(h1 + h2).toNumber();
    const activeOrForecastMonths = cells.filter(
      (c) => c.hasActual || c.isForecast
    ).length;
    const monthlyAvg =
      activeOrForecastMonths > 0
        ? round2(fullYearTotal / activeOrForecastMonths).toNumber()
        : 0;

    return {
      project: p,
      cells,
      actualYtd,
      totalImsYtd,
      totalBillableYtd,
      q1,
      q2,
      q3,
      q4,
      h1,
      h2,
      fullYearTotal,
      monthlyAvg,
    };
  });

  rows.sort((a, b) => b.fullYearTotal - a.fullYearTotal);

  const monthTotals = Array.from({ length: 12 }, (_, idx) =>
    round2(rows.reduce((sum, r) => sum + r.cells[idx].netProfit, 0)).toNumber()
  );
  const grandActualYtd = round2(rows.reduce((s, r) => s + r.actualYtd, 0)).toNumber();
  const grandImsYtd = round2(rows.reduce((s, r) => s + r.totalImsYtd, 0)).toNumber();
  const grandQ1 = round2(rows.reduce((s, r) => s + r.q1, 0)).toNumber();
  const grandQ2 = round2(rows.reduce((s, r) => s + r.q2, 0)).toNumber();
  const grandQ3 = round2(rows.reduce((s, r) => s + r.q3, 0)).toNumber();
  const grandQ4 = round2(rows.reduce((s, r) => s + r.q4, 0)).toNumber();
  const grandH1 = round2(rows.reduce((s, r) => s + r.h1, 0)).toNumber();
  const grandH2 = round2(rows.reduce((s, r) => s + r.h2, 0)).toNumber();
  const grandFullYear = round2(rows.reduce((s, r) => s + r.fullYearTotal, 0)).toNumber();
  const grandMonthlyAvg = round2(grandFullYear / 12).toNumber();

  return {
    rows,
    monthTotals,
    grandActualYtd,
    grandImsYtd,
    grandQ1,
    grandQ2,
    grandQ3,
    grandQ4,
    grandH1,
    grandH2,
    grandFullYear,
    grandMonthlyAvg,
  };
}
