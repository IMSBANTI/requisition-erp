export function formatBDT(n: number) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactBDT(n: number) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export const BILLING_MODEL_LABELS: Record<string, string> = {
  COST_PLUS: "Cost + Service Fee",
  COST_PLUS_GROSSUP: "Cost + Fee (AIT Gross-Up)",
  COMMISSION: "Direct Commission",
  FIXED_FEE: "Fixed Retainer",
  FIXED_QUOTE: "Fixed Event Quote",
};

export const PIE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#ea580c",
];

export const MONTH_NAMES = [
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

export type ClientBillItem = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  kind: string;
  forMonth: string;
  billNumber: string;
  poNumber: string;
  status: string;
  billableCost: number;
  imsInvestment: number;
  billExVat: number;
  vatAmount: number;
  billWithVat: number;
  aitAmount: number;
  expectedInflow: number;
  receivedAmount: number;
  accruedNetProfit: number;
  realizedNetProfit: number;
  submittedAt: string;
  dueDate: string;
  receivedAt: string;
  poReceivedAt?: string;
  grReceivedAt?: string;
  deviationReason: string;
  notes: string;
  isOpeningBalance?: boolean;
};

export type RequisitionLineItem = {
  id: string;
  sl: number;
  particulars: string;
  costHead: string;
  costTag: string;
  forMonth?: string;
  lastMonthAmount?: number;
  amount: number;
};

export type RequisitionSummaryItem = {
  id: string;
  number: string;
  forMonth: string;
  date: string;
  disburseOn?: string;
  approvedAt?: string;
  executedAt?: string;
  makerName: string;
  status: string;
  currency?: string;
  billableCost: number;
  imsInvestment: number;
  total: number;
  disbursedAmount?: number;
  variancePct?: number | null;
  changeReason?: string;
  remarks?: string;
  items?: RequisitionLineItem[];
  divisionName?: string;
};

export type ProjectFinanceItem = {
  id: string;
  code: string;
  name: string;
  companyName: string;
  kind: string;
  headName: string;
  checkerName?: string;
  directorName: string;
  budget: number;
  terms: {
    billingProfile: any;
    feeRate: number;
    aitRate: number;
    aitGrossupRate?: number;
    reimbursementTaxDivisor?: number;
    fixedKamRecovery?: number;
    vatRate: number;
    billCycleDays: number;
    funding: any;
    fixedMonthlyBill: number;
    maintenanceBudget: number;
    monthlyAmortization: number;
  };
  reqCount: number;
  requisitionsList: RequisitionSummaryItem[];
  totalBillableReq: number;
  totalImsInvReq: number;
  executedBillable: number;
  executedImsInv: number;
  overallCalc: any;
  monthlyBreakdown: Array<{
    forMonth: string;
    billableCost: number;
    imsInvestment: number;
    executedBillable: number;
    executedImsInv: number;
    reqCount: number;
    approvedReqCount?: number;
  }>;
  bills: ClientBillItem[];
  totalReceivedFromBills: number;
  totalExpectedFromBills: number;
  totalBilledWithVat: number;
  costHeads?: Array<{
    id: string;
    name: string;
    tag: string;
    aliases?: string[];
    fixedMonthlyAmount?: number;
  }>;
  closedMonths?: Record<
    string,
    { closedAt: string; closedBy: string; noBillReason?: string }
  >;
  manualForecasts?: Record<
    string,
    { amount: number; note: string; updatedBy: string; updatedAt: string }
  >;
};
