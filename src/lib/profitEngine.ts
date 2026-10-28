import Decimal from "decimal.js";

export type BillingProfile =
  | "COST_PLUS"
  | "COST_PLUS_GROSSUP"
  | "COMMISSION"
  | "FIXED_FEE"
  | "FIXED_QUOTE";

export type CostTag = "BILLABLE" | "IMS_INVESTMENT";

export interface CostHeadConfig {
  id: string;
  name: string;
  tag: CostTag;
  isSalary?: boolean;
  defaultAmount?: number;
}

export interface BillingTermsInput {
  billingProfile: BillingProfile | string;
  /** Decimal rate (e.g. 0.08 for 8%, 0.045 for 4.5%) */
  feeRate: number | string | Decimal;
  /** Decimal rate (e.g. 0.012 for 1.2%, 0.02 for 2%) */
  aitRate: number | string | Decimal;
  /** Decimal rate (default 0.15 for 15%) */
  vatRate?: number | string | Decimal;
  billCycleDays?: number;
  funding?: "POSTPAID" | "PREPAID" | string;
  salaryMonthLag?: number;
  /** Used for FIXED_FEE (Project) or FIXED_QUOTE (Event) */
  fixedMonthlyBill?: number | string | Decimal | null;
  /** Monthly maintenance budget for FIXED_FEE projects */
  maintenanceBudget?: number | string | Decimal;
  /** Monthly capex amortization + cost of fund for FIXED_FEE projects */
  monthlyAmortization?: number | string | Decimal;
  /** Variance % threshold requiring mandatory reason (default 10%) */
  varianceThresholdPct?: number | string | Decimal;
}

export interface ProfitCalculationInput {
  terms: BillingTermsInput;
  billableCost: number | string | Decimal;
  imsInvestment: number | string | Decimal;
  /** Optional override for maintenance budget in a specific month */
  maintenanceCostOverride?: number | string | Decimal;
  /** Optional override for capex amortization in a specific month */
  amortizationOverride?: number | string | Decimal;
}

export interface ProfitCalculationResult {
  billingProfile: string;
  billableCost: number;
  imsInvestment: number;
  totalRequested: number;
  feeRatePct: number;
  aitRatePct: number;
  vatRatePct: number;
  feeAmount: number;
  aitGrossupAmount: number;
  billExVat: number;
  vatAmount: number;
  billWithVat: number;
  aitDeducted: number;
  expectedInflow: number;
  grossProfit: number;
  maintenanceCost: number;
  amortizationCost: number;
  netProfit: number;
  netMarginPct: number;
}

/**
 * Standard 2-decimal rounding (ROUND_HALF_UP) at each published step,
 * matching IMS Outsourcing Finance Tracker specification (.agents/rules/01-business-rules.md).
 */
export function round2(val: Decimal | number | string): Decimal {
  return new Decimal(val || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Normalize a rate that might be stored either as a decimal fraction (0.08) or percentage (8).
 * Any value > 1 is treated as a percentage and divided by 100.
 */
export function normalizeRate(rate: Decimal | number | string | undefined | null, fallback = 0): Decimal {
  if (rate === undefined || rate === null || rate === "") return new Decimal(fallback);
  const d = new Decimal(rate);
  if (d.greaterThan(1)) {
    return d.dividedBy(100);
  }
  return d;
}

/**
 * Core Project & Event Billing and Profit Calculator.
 * Matches all 5 Golden Test Cases in docs/TEST_CASES.md within ±1 BDT.
 */
export function calculateProfitSummary(input: ProfitCalculationInput): ProfitCalculationResult {
  const profile = (input.terms.billingProfile || "COST_PLUS").toUpperCase();
  const billable = round2(input.billableCost || 0);
  const imsInv = round2(input.imsInvestment || 0);
  const totalReq = round2(billable.plus(imsInv));

  const feeRate = normalizeRate(input.terms.feeRate, 0.08);
  const aitRate = normalizeRate(input.terms.aitRate, 0.012);
  const vatRate = normalizeRate(input.terms.vatRate, 0.15);

  let fee = new Decimal(0);
  let aitGrossup = new Decimal(0);
  let billExVat = new Decimal(0);
  let ait = new Decimal(0);

  if (profile === "COST_PLUS") {
    fee = round2(billable.times(feeRate));
    billExVat = round2(billable.plus(fee));
    ait = round2(billExVat.times(aitRate));
  } else if (profile === "COST_PLUS_GROSSUP") {
    fee = round2(billable.times(feeRate));
    aitGrossup = round2(billable.plus(fee).times(aitRate));
    billExVat = round2(billable.plus(fee).plus(aitGrossup));
    ait = round2(billExVat.times(aitRate));
  } else if (profile === "COMMISSION") {
    // Pass-through cost + commission %; AIT is deducted on the commission only
    fee = round2(billable.times(feeRate));
    billExVat = round2(billable.plus(fee));
    ait = round2(fee.times(aitRate));
  } else if (profile === "FIXED_FEE" || profile === "FIXED_QUOTE") {
    const fixedBill = round2(input.terms.fixedMonthlyBill || 0);
    billExVat = fixedBill;
    fee = round2(Decimal.max(0, fixedBill.minus(billable)));
    ait = round2(billExVat.times(aitRate));
  } else {
    // Fallback to COST_PLUS
    fee = round2(billable.times(feeRate));
    billExVat = round2(billable.plus(fee));
    ait = round2(billExVat.times(aitRate));
  }

  const vat = round2(billExVat.times(vatRate));
  const billWithVat = round2(billExVat.plus(vat));
  const expectedInflow = round2(billExVat.minus(ait));
  const grossProfit = round2(expectedInflow.minus(billable));

  const maintenance = round2(
    input.maintenanceCostOverride !== undefined
      ? input.maintenanceCostOverride
      : input.terms.maintenanceBudget || 0
  );
  const amortization = round2(
    input.amortizationOverride !== undefined
      ? input.amortizationOverride
      : input.terms.monthlyAmortization || 0
  );

  const netProfit = round2(
    grossProfit.minus(imsInv).minus(amortization).minus(maintenance)
  );

  const netMarginPct = billExVat.greaterThan(0)
    ? round2(netProfit.dividedBy(billExVat).times(100)).toNumber()
    : 0;

  return {
    billingProfile: profile,
    billableCost: billable.toNumber(),
    imsInvestment: imsInv.toNumber(),
    totalRequested: totalReq.toNumber(),
    feeRatePct: round2(feeRate.times(100)).toNumber(),
    aitRatePct: round2(aitRate.times(100)).toNumber(),
    vatRatePct: round2(vatRate.times(100)).toNumber(),
    feeAmount: fee.toNumber(),
    aitGrossupAmount: aitGrossup.toNumber(),
    billExVat: billExVat.toNumber(),
    vatAmount: vat.toNumber(),
    billWithVat: billWithVat.toNumber(),
    aitDeducted: ait.toNumber(),
    expectedInflow: expectedInflow.toNumber(),
    grossProfit: grossProfit.toNumber(),
    maintenanceCost: maintenance.toNumber(),
    amortizationCost: amortization.toNumber(),
    netProfit: netProfit.toNumber(),
    netMarginPct,
  };
}

/**
 * Calculate monthly amortization + cost of fund for a Capex item (used by FIXED_FEE setups like DBH).
 */
export function calculateCapexMonthlyAmortization(params: {
  totalCost: number;
  amortizeMonths: number;
  costOfFundRateAnnual?: number; // e.g. 0.09 for 9% p.a.
  costOfFundFlatMonthly?: number; // optional exact monthly cost of fund override
}): { principalMonthly: number; costOfFundMonthly: number; totalMonthlyAmortization: number } {
  const total = new Decimal(params.totalCost || 0);
  const months = Math.max(1, params.amortizeMonths || 1);
  const principalMonthly = round2(total.dividedBy(months));

  let cofMonthly = new Decimal(0);
  if (params.costOfFundFlatMonthly !== undefined && params.costOfFundFlatMonthly > 0) {
    cofMonthly = round2(params.costOfFundFlatMonthly);
  } else if (params.costOfFundRateAnnual) {
    const rate = normalizeRate(params.costOfFundRateAnnual, 0);
    cofMonthly = round2(total.times(rate).dividedBy(12));
  }

  return {
    principalMonthly: principalMonthly.toNumber(),
    costOfFundMonthly: cofMonthly.toNumber(),
    totalMonthlyAmortization: round2(principalMonthly.plus(cofMonthly)).toNumber(),
  };
}

/**
 * Calculate % variance vs. last month (for Projects) or vs. approved budget (for Events).
 */
export function calculateVariance(params: {
  currentTotal: number;
  baselineTotal: number; // Last month total (Project) or Approved Budget (Event)
  thresholdPct?: number;
  mode: "PROJECT" | "EVENT";
}): {
  diffAmount: number;
  variancePct: number | null;
  requiresReason: boolean;
  reasonPrompt: string;
} {
  const current = round2(params.currentTotal || 0);
  const baseline = round2(params.baselineTotal || 0);
  const threshold = new Decimal(params.thresholdPct ?? 10);

  if (baseline.lessThanOrEqualTo(0)) {
    return {
      diffAmount: current.toNumber(),
      variancePct: null,
      requiresReason: false,
      reasonPrompt: "",
    };
  }

  const diff = round2(current.minus(baseline));
  const pct = round2(diff.dividedBy(baseline).times(100));

  if (params.mode === "PROJECT") {
    // Project rule: if absolute change vs last month > threshold% (default 10%), reason is mandatory
    const requiresReason = pct.abs().greaterThan(threshold);
    return {
      diffAmount: diff.toNumber(),
      variancePct: pct.toNumber(),
      requiresReason,
      reasonPrompt: requiresReason
        ? `Total differs from last month by ${pct.greaterThan(0) ? "+" : ""}${pct.toFixed(1)}% (threshold ±${threshold.toString()}%). A reason for changes is mandatory.`
        : "",
    };
  } else {
    // Event rule: if cumulative event spend exceeds approved Event budget, reason is mandatory
    const exceedsBudget = diff.greaterThan(0);
    return {
      diffAmount: diff.toNumber(),
      variancePct: pct.toNumber(),
      requiresReason: exceedsBudget,
      reasonPrompt: exceedsBudget
        ? `Event requisition exceeds the approved Event Budget by Tk ${diff.toFixed(2)} (+${pct.toFixed(1)}%). Justification is mandatory.`
        : "",
    };
  }
}

/**
 * Default Cost Heads for Outsourcing / Regular Projects (strictly for 📁 Project Requisition)
 */
export const DEFAULT_PROJECT_COST_HEADS: CostHeadConfig[] = [
  { id: "ff_fixed_salary", name: "Field force fixed salary", tag: "BILLABLE", isSalary: true },
  { id: "ff_var_salary", name: "Field force variable salary", tag: "BILLABLE", isSalary: true },
  { id: "bo_fixed_salary", name: "Back office fixed salary", tag: "BILLABLE", isSalary: true },
  { id: "house_rent", name: "House rent", tag: "BILLABLE", isSalary: false },
  { id: "utilities", name: "Utilities (elec/water/gas/net)", tag: "BILLABLE", isSalary: false },
  { id: "mobile_bill", name: "Mobile bill", tag: "BILLABLE", isSalary: false },
  { id: "tracking_cost", name: "Tracking cost", tag: "BILLABLE", isSalary: false },
  { id: "conveyance", name: "Conveyance & field travel", tag: "BILLABLE", isSalary: false },
  { id: "courier_misc", name: "Courier / stamp / stationery", tag: "BILLABLE", isSalary: false },
  { id: "pm_cost", name: "Project manager cost (IMS)", tag: "IMS_INVESTMENT", isSalary: true },
  { id: "ims_support", name: "IMS unbilled support / investment", tag: "IMS_INVESTMENT", isSalary: false },
];

/**
 * Default Cost Heads for Events / Activations (strictly for 🎪 Event Requisition)
 */
export const DEFAULT_EVENT_COST_HEADS: CostHeadConfig[] = [
  { id: "evt_venue_stage", name: "Venue & Stage Fabrication", tag: "BILLABLE", isSalary: false },
  { id: "evt_sound_light", name: "Sound, Light & LED/AV System", tag: "BILLABLE", isSalary: false },
  { id: "evt_booth_decor", name: "Booth, Stall & Decor Setup", tag: "BILLABLE", isSalary: false },
  { id: "evt_promoters", name: "Promoters, Anchors & Event Crew", tag: "BILLABLE", isSalary: false },
  { id: "evt_artist_guest", name: "Artist, Performer & Guest Honorarium", tag: "BILLABLE", isSalary: false },
  { id: "evt_branding", name: "Printing, Branding & Merchandise", tag: "BILLABLE", isSalary: false },
  { id: "evt_gifts", name: "Gifts, Crests & Souvenirs", tag: "BILLABLE", isSalary: false },
  { id: "evt_hospitality", name: "Hospitality, Food & Refreshments", tag: "BILLABLE", isSalary: false },
  { id: "evt_media_photo", name: "Photography, Videography & Media", tag: "BILLABLE", isSalary: false },
  { id: "evt_logistics", name: "Transport, Fuel & Event Logistics", tag: "BILLABLE", isSalary: false },
  { id: "evt_permissions", name: "Permissions, Security & Misc", tag: "BILLABLE", isSalary: false },
  { id: "evt_ims_inv", name: "IMS Event Supervision / Unbilled Cost", tag: "IMS_INVESTMENT", isSalary: false },
];

const PROJECT_DEFAULT_IDS = new Set(DEFAULT_PROJECT_COST_HEADS.map((h) => h.id));
const PROJECT_DEFAULT_NAMES = new Set(
  DEFAULT_PROJECT_COST_HEADS.map((h) => h.name.toLowerCase())
);

/**
 * Ensures Events never inherit Outsourcing Project salary/house-rent cost heads,
 * and Projects never inherit Event cost heads unless explicitly customized for that mode.
 */
export function resolveCostHeadsForKind(
  rawCostHeads: unknown,
  isEvent: boolean
): CostHeadConfig[] {
  if (Array.isArray(rawCostHeads) && rawCostHeads.length > 0) {
    if (isEvent) {
      // Filter out any accidentally saved Outsourcing Project default cost heads
      const cleaned = (rawCostHeads as CostHeadConfig[]).filter(
        (ch) =>
          ch &&
          ch.name &&
          !PROJECT_DEFAULT_IDS.has(ch.id) &&
          !PROJECT_DEFAULT_NAMES.has(ch.name.toLowerCase())
      );
      if (cleaned.length > 0) return cleaned;
      return DEFAULT_EVENT_COST_HEADS;
    }
    return rawCostHeads as CostHeadConfig[];
  }
  return isEvent ? DEFAULT_EVENT_COST_HEADS : DEFAULT_PROJECT_COST_HEADS;
}

/**
 * Default Billing Terms presets for known IMS Projects & Events when not yet customized in DB.
 */
export function getDefaultProjectTermsByCode(code: string, kind?: string): BillingTermsInput {
  const c = (code || "").toUpperCase();
  const isEvent = kind === "EVENT" || c.startsWith("EVT-");

  if (isEvent) {
    return {
      billingProfile: "COST_PLUS",
      feeRate: 0.1, // 10% Agency Fee default for Events
      aitRate: 0.02, // 2% AIT
      vatRate: 0.15, // 15% VAT
      billCycleDays: 30,
      funding: "POSTPAID",
      salaryMonthLag: 0,
      varianceThresholdPct: 10,
    };
  }

  // Known Outsourcing Projects from IMS Outsourcing Finance Spec
  if (c.includes("ROBI")) {
    return {
      billingProfile: "COST_PLUS_GROSSUP",
      feeRate: 0.045, // 4.5% Management Fee
      aitRate: 0.02, // 2.0% AIT grossed up into bill
      vatRate: 0.15,
      billCycleDays: 30,
      funding: "POSTPAID",
      salaryMonthLag: 1,
      varianceThresholdPct: 10,
    };
  }

  if (c.includes("UNILEVER") || c.includes("PUREIT") || c.includes("UBL")) {
    return {
      billingProfile: "COST_PLUS",
      feeRate: 0.08, // 8.0% Management Fee
      aitRate: 0.012, // 1.2% AIT
      vatRate: 0.15,
      billCycleDays: 60,
      funding: "POSTPAID",
      salaryMonthLag: 1,
      varianceThresholdPct: 10,
    };
  }

  if (c.includes("RSO")) {
    return {
      billingProfile: "COMMISSION",
      feeRate: 0.012, // 1.2% Commission
      aitRate: 0.012, // 1.2% AIT on commission
      vatRate: 0.15,
      billCycleDays: 0,
      funding: "PREPAID",
      salaryMonthLag: 0,
      varianceThresholdPct: 10,
    };
  }

  if (c.includes("DBH")) {
    return {
      billingProfile: "FIXED_FEE",
      feeRate: 0,
      aitRate: 0.015, // 1.5% AIT
      vatRate: 0.15,
      billCycleDays: 15,
      funding: "POSTPAID",
      salaryMonthLag: 0,
      fixedMonthlyBill: 278685,
      maintenanceBudget: 7200,
      monthlyAmortization: 112627.06,
      varianceThresholdPct: 10,
    };
  }

  // General Outsourcing Project Default
  return {
    billingProfile: "COST_PLUS",
    feeRate: 0.08,
    aitRate: 0.012,
    vatRate: 0.15,
    billCycleDays: 30,
    funding: "POSTPAID",
    salaryMonthLag: 1,
    varianceThresholdPct: 10,
  };
}
