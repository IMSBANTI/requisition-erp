import { prisma } from "@/lib/db";
import { amountInWords } from "@/lib/numberToWords";
import {
  calculateProfitSummary,
  extractProjectMeta,
  packCostHeadsWithMeta,
  resolveCostHeadsForKind,
  type BillingTermsInput,
} from "@/lib/profitEngine";

type HistoricalItemSpec = {
  costHead: string;
  costTag: "BILLABLE" | "IMS_INVESTMENT";
  isSalary?: boolean;
  particulars: string;
  amount: number;
};

type HistoricalBillSpec = {
  forMonth: string;
  billNumber: string;
  poNumber: string;
  status: string;
  billExVat: number;
  vatAmount: number;
  billWithVat: number;
  aitAmount: number;
  expectedInflow: number;
  receivedAmount: number;
  submittedAt?: string;
  dueDate?: string;
  receivedAt?: string;
  notes?: string;
};

type HistoricalMonthEntry = {
  forMonth: string;
  voucherNumber: string;
  poNumber?: string;
  comments: string;
  items: HistoricalItemSpec[];
  bills?: HistoricalBillSpec[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function getPreviousYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function makeRobiMonth(
  forMonth: string,
  poNumber: string,
  d: {
    ffFixed: number;
    boFixed: number;
    ffVar: number;
    boVar: number;
    officeOps: number;
    laptopMobFurn: number;
    trackingBonus: number;
    pmCost: number;
  },
  bills: HistoricalBillSpec[]
): HistoricalMonthEntry {
  const mm = forMonth.slice(5);
  return {
    forMonth,
    voucherNumber: `IMS-HIST-ROBI-2026-${mm}`,
    poNumber,
    comments: `Historical Jan–Oct 2026 import from Robi SME Profit Calculation (${forMonth})`,
    items: [
      { costHead: "SME Field Force Fixed Salary", costTag: "BILLABLE", isSalary: true, particulars: "SME Field Force Fixed Salary", amount: round2(d.ffFixed) },
      { costHead: "Back Office Fixed Salary (BO + EBS + SSE)", costTag: "BILLABLE", isSalary: true, particulars: "Back Office Fixed Salary (BO + EBS + SSE)", amount: round2(d.boFixed) },
      { costHead: "SME Field Force Variable Salary", costTag: "BILLABLE", isSalary: true, particulars: "SME Field Force Variable Salary", amount: round2(d.ffVar) },
      { costHead: "Back Office Variable Salary (BO + EBS + SSE)", costTag: "BILLABLE", isSalary: true, particulars: "Back Office Variable Salary (BO + EBS + SSE)", amount: round2(d.boVar) },
      { costHead: "House Rent", costTag: "BILLABLE", particulars: "Office Expenditure (22 Zone Offices)", amount: round2(d.officeOps) },
      { costHead: "Mobile Bill (Previous Month)", costTag: "BILLABLE", particulars: "Laptop / Mobile Bill / Furniture Cost", amount: round2(d.laptopMobFurn) },
      { costHead: "Tracking Cost", costTag: "BILLABLE", particulars: "Tracking / Campaign / Festival Bonus", amount: round2(d.trackingBonus) },
      { costHead: "Project Manager Cost (IMS)", costTag: "IMS_INVESTMENT", isSalary: true, particulars: "Monthly IMS HR Investment (KAM + OE)", amount: round2(d.pmCost) },
    ],
    bills,
  };
}

// Verified exact figures from "3._Robi_SME_Profit_Calculation_2026-Till_Oct_07_2026_(R).xls"
const ROBI_2026_HISTORY: HistoricalMonthEntry[] = [
  makeRobiMonth(
    "2026-01",
    "4600000443",
    { ffFixed: 2374839, boFixed: 400690, ffVar: 511077, boVar: 275003, officeOps: 662950, laptopMobFurn: 195432.18, trackingBonus: 69070, pmCost: 38000 },
    [{
      forMonth: "2026-01",
      billNumber: "2026/01/25/SME January/Robi-02",
      poNumber: "4600000443",
      status: "PAID",
      billExVat: 4784890.31,
      vatAmount: 717733.55,
      billWithVat: 5502623.86,
      aitAmount: 95697.81,
      expectedInflow: 4689192.51,
      receivedAmount: 4689192.63,
      submittedAt: "2026-03-08",
      dueDate: "2026-04-07",
      receivedAt: "2026-05-07",
    }]
  ),
  makeRobiMonth(
    "2026-02",
    "4600000443",
    { ffFixed: 2357661, boFixed: 408771, ffVar: 642516.76, boVar: 284850, officeOps: 714120, laptopMobFurn: 192237, trackingBonus: 1663978, pmCost: 38000 },
    [{
      forMonth: "2026-02",
      billNumber: "2026/02/80/SME February/Robi-01",
      poNumber: "4600000443",
      status: "PAID",
      billExVat: 6676940.43,
      vatAmount: 1001541.07,
      billWithVat: 7678481.50,
      aitAmount: 133538.81,
      expectedInflow: 6543401.62,
      receivedAmount: 6543401.20,
      submittedAt: "2026-04-01",
      dueDate: "2026-05-01",
      receivedAt: "2026-05-07",
    }]
  ),
  makeRobiMonth(
    "2026-03",
    "4600000443",
    { ffFixed: 2217303, boFixed: 389541, ffVar: 764137.00, boVar: 253570, officeOps: 736355, laptopMobFurn: 203202, trackingBonus: 13185, pmCost: 38000 },
    [{
      forMonth: "2026-03",
      billNumber: "2026/03/151/SME March/Robi-02",
      poNumber: "4600000443",
      status: "PAID",
      billExVat: 4878936.61,
      vatAmount: 731840.49,
      billWithVat: 5610777.10,
      aitAmount: 97578.73,
      expectedInflow: 4781357.88,
      receivedAmount: 4781357.79,
      submittedAt: "2026-04-21",
      dueDate: "2026-05-21",
      receivedAt: "2026-05-20",
    }]
  ),
  makeRobiMonth(
    "2026-04",
    "4600000517",
    { ffFixed: 2392674.20, boFixed: 316041, ffVar: 1189492.81, boVar: 218378.33, officeOps: 727840, laptopMobFurn: 213328, trackingBonus: 13635, pmCost: 38000 },
    [{
      forMonth: "2026-04",
      billNumber: "2026/04/241/SME April/Robi-01",
      poNumber: "4600000517",
      status: "PAID",
      billExVat: 5405593.04,
      vatAmount: 810838.96,
      billWithVat: 6216432.00,
      aitAmount: 108111.86,
      expectedInflow: 5297481.18,
      receivedAmount: 5351537.11,
      submittedAt: "2026-05-21",
      dueDate: "2026-06-20",
      receivedAt: "2026-07-22",
      notes: "Includes 1% AIT rate adjustment (+Tk 54,055.93 inflow)",
    }]
  ),
  makeRobiMonth(
    "2026-05",
    "4600000517",
    { ffFixed: 2440599, boFixed: 327241, ffVar: 1534842.08, boVar: 211245, officeOps: 726925, laptopMobFurn: 213328, trackingBonus: 1796306, pmCost: 38000 },
    [{
      forMonth: "2026-05",
      billNumber: "2026/05/301/SME May/Robi-02",
      poNumber: "4600000517",
      status: "PAID",
      billExVat: 7728292.17,
      vatAmount: 1159243.83,
      billWithVat: 8887536.00,
      aitAmount: 154565.84,
      expectedInflow: 7573726.33,
      receivedAmount: 7651009.25,
      submittedAt: "2026-07-01",
      dueDate: "2026-07-31",
      receivedAt: "2026-08-12",
      notes: "Includes 1% AIT rate adjustment (+Tk 77,282.92 inflow)",
    }]
  ),
  makeRobiMonth(
    "2026-06",
    "4600000517",
    { ffFixed: 2265636.60, boFixed: 327240.70, ffVar: 1346147.92, boVar: 211825, officeOps: 727390, laptopMobFurn: 265217, trackingBonus: 14085, pmCost: 38000 },
    [
      {
        forMonth: "2026-06",
        billNumber: "2026/06/369/SME June/Robi-01",
        poNumber: "4600000517",
        status: "PAID",
        billExVat: 2781009.57,
        vatAmount: 417151.43,
        billWithVat: 3198161.00,
        aitAmount: 55620.19,
        expectedInflow: 2725389.37,
        receivedAmount: 2753199.46,
        submittedAt: "2026-07-28",
        dueDate: "2026-08-27",
        receivedAt: "2026-08-17",
      },
      {
        forMonth: "2026-06",
        billNumber: "2026/06/369/SME June/Robi-02",
        poNumber: "4600000517",
        status: "PAID",
        billExVat: 2716414.78,
        vatAmount: 407462.22,
        billWithVat: 3123877.00,
        aitAmount: 54328.30,
        expectedInflow: 2662086.49,
        receivedAmount: 2689254.89,
        submittedAt: "2026-08-13",
        dueDate: "2026-09-12",
        receivedAt: "2026-09-07",
      },
    ]
  ),
  makeRobiMonth(
    "2026-07",
    "4600000585",
    { ffFixed: 2392548.01, boFixed: 315241, ffVar: 1713242.99, boVar: 213615, officeOps: 721470, laptopMobFurn: 568550.67, trackingBonus: 14130, pmCost: 38000 },
    [{
      forMonth: "2026-07",
      billNumber: "2026/07/429/SME July/Robi-02",
      poNumber: "4600000585",
      status: "PAID",
      billExVat: 6330164.35,
      vatAmount: 949524.65,
      billWithVat: 7279689.00,
      aitAmount: 126603.29,
      expectedInflow: 6203561.06,
      receivedAmount: 6266862.69,
      submittedAt: "2026-08-18",
      dueDate: "2026-09-17",
      receivedAt: "2026-10-08",
    }]
  ),
  makeRobiMonth(
    "2026-08",
    "4600000585",
    { ffFixed: 2790156.80, boFixed: 315241, ffVar: 1669014.87, boVar: 203135, officeOps: 735130, laptopMobFurn: 161411, trackingBonus: 14490, pmCost: 38000 },
    [{
      forMonth: "2026-08",
      billNumber: "2026/08/491/SME August/Robi-01",
      poNumber: "4600000585",
      status: "PAID",
      billExVat: 6276635.65,
      vatAmount: 941495.35,
      billWithVat: 7218131.00,
      aitAmount: 125532.71,
      expectedInflow: 6151102.94,
      receivedAmount: 6213869.30,
      submittedAt: "2026-09-22",
      dueDate: "2026-10-22",
      receivedAt: "2026-10-29",
    }]
  ),
  makeRobiMonth(
    "2026-09",
    "4600000585",
    { ffFixed: 2747776.92, boFixed: 315241, ffVar: 1673563.08, boVar: 208435, officeOps: 778505, laptopMobFurn: 235794.70, trackingBonus: 15300, pmCost: 38000 },
    [
      {
        forMonth: "2026-09",
        billNumber: "2026/09/590/SME September/Robi-02",
        poNumber: "4600000585",
        status: "BILL_SUBMITTED",
        billExVat: 2833751.30,
        vatAmount: 425062.70,
        billWithVat: 3258814.00,
        aitAmount: 56675.03,
        expectedInflow: 2777076.28,
        receivedAmount: 0,
        submittedAt: "2026-10-26",
        dueDate: "2026-11-25",
        notes: "Sept'26 Part-1 Bill submitted",
      },
      {
        forMonth: "2026-09",
        billNumber: "2026/09/590/SME September/Robi-03",
        poNumber: "",
        status: "PO_RECEIVED",
        billExVat: 3534591.30,
        vatAmount: 530188.70,
        billWithVat: 4064780.00,
        aitAmount: 70691.83,
        expectedInflow: 3463899.48,
        receivedAmount: 0,
        notes: "Sept'26 Part-2 Bill on process",
      },
    ]
  ),
  makeRobiMonth(
    "2026-10",
    "4600000585",
    { ffFixed: 2559753.48, boFixed: 307241, ffVar: 1651993.64, boVar: 210629, officeOps: 738575, laptopMobFurn: 251408, trackingBonus: 15300, pmCost: 38000 },
    []
  ),
];

// Verified exact figures from "01._DBH_Office_Set_up_(Daily_Exp+_Profit_Calculation)_Year_2026.xls"
const DBH_MONTH_INFO: Array<{
  ym: string;
  billNo: string;
  paid: boolean;
  recAmt: number;
  subDate: string;
  dueDate: string;
  recDate?: string;
}> = [
  { ym: "2026-01", billNo: "2026/01/05/Management Service for Serviced Facility/January/DBH-1", paid: true, recAmt: 276621, subDate: "2026-01-06", dueDate: "2026-01-25", recDate: "2026-01-26" },
  { ym: "2026-02", billNo: "2026/02/83/Management Service for Serviced Facility/February/DBH-1", paid: true, recAmt: 276621, subDate: "2026-02-15", dueDate: "2026-02-26", recDate: "2026-02-26" },
  { ym: "2026-03", billNo: "2026/03/149/Management Service for Serviced Facility/March/DBH-1", paid: true, recAmt: 276621, subDate: "2026-03-04", dueDate: "2026-03-25", recDate: "2026-03-25" },
  { ym: "2026-04", billNo: "2026/04/209/Management Service for Serviced Facility/April/DBH-1", paid: true, recAmt: 276621, subDate: "2026-04-09", dueDate: "2026-04-25", recDate: "2026-04-27" },
  { ym: "2026-05", billNo: "2026/05/300/Management Service for Serviced Facility/May/DBH-1", paid: true, recAmt: 276621, subDate: "2026-05-08", dueDate: "2026-05-25", recDate: "2026-05-25" },
  { ym: "2026-06", billNo: "2026/06/359/Management Service for Serviced Facility/June/DBH-1", paid: true, recAmt: 276621, subDate: "2026-06-07", dueDate: "2026-06-28", recDate: "2026-06-30" },
  { ym: "2026-07", billNo: "2026/07/420/Management Service for Serviced Facility/July/DBH-1", paid: true, recAmt: 275898, subDate: "2026-07-08", dueDate: "2026-07-30", recDate: "2026-07-28" },
  { ym: "2026-08", billNo: "2026/08/494/Management Service for Serviced Facility/August/DBH-1", paid: true, recAmt: 275898, subDate: "2026-08-05", dueDate: "2026-08-28", recDate: "2026-08-29" },
  { ym: "2026-09", billNo: "2026/09/560/Management Service for Serviced Facility/September/DBH-1", paid: true, recAmt: 275898, subDate: "2026-09-07", dueDate: "2026-09-27", recDate: "2026-09-26" },
  { ym: "2026-10", billNo: "2026/10/636/Management Service for Serviced Facility/October/DBH-1", paid: false, recAmt: 0, subDate: "2026-10-26", dueDate: "2026-11-15" },
];

const DBH_OFFICE_2026_HISTORY: HistoricalMonthEntry[] = DBH_MONTH_INFO.map((m) => ({
  forMonth: m.ym,
  voucherNumber: `IMS-HIST-DBH-2026-${m.ym.slice(5)}`,
  poNumber: "As Per Agreement",
  comments: `Historical Jan–Oct 2026 import from DBH Office Set-up 4 Regional Offices (${m.ym})`,
  items: [
    { costHead: "House Rent (Branch Office)", costTag: "BILLABLE", particulars: "House Rent (Tongi 22,500 + Savar 21,000 + Basila 18,000 + Matuail 20,000)", amount: 81500 },
    { costHead: "Utility (Electricity / Water / Gas)", costTag: "BILLABLE", particulars: "Utilities across 4 Branch Offices", amount: 18750 },
    { costHead: "Internet Connection", costTag: "BILLABLE", particulars: "Internet across 4 Branch Offices", amount: 6500 },
    { costHead: "Refreshment & Drinking Water", costTag: "BILLABLE", particulars: "Refreshment & Water (4 Offices × 2,500)", amount: 10000 },
    { costHead: "Hygienic Item & Cleaning Materials", costTag: "BILLABLE", particulars: "Hygienic & Cleaning Supplies (4 Offices × 2,500)", amount: 10000 },
    { costHead: "Peon / Office Support Service", costTag: "BILLABLE", particulars: "Peon Support Service (4 Offices × 14,000)", amount: 56000 },
  ],
  bills: [
    {
      forMonth: m.ym,
      billNumber: m.billNo,
      poNumber: "As Per Agreement",
      status: m.paid ? "PAID" : "BILL_SUBMITTED",
      billExVat: 278685.16,
      vatAmount: 41802.77,
      billWithVat: 320487.94,
      aitAmount: 4180.28,
      expectedInflow: 274504.88,
      receivedAmount: m.recAmt,
      submittedAt: m.subDate,
      dueDate: m.dueDate,
      receivedAt: m.recDate,
      notes: "Includes Tk 43,514.84 setup amortization + Tk 7,200 monthly maintenance reserve",
    },
  ],
}));

// Verified exact figures from "01._DBH_Finance_Sales_Officer_(Daily_Expenditure+_Profit_Calculation)_Year_2026.xlsx"
const SO_RAW: Array<{
  ym: string;
  salaryExp: number;
  eidBonusExp?: number;
  incentiveExp?: number;
  billNo: string;
  billExVat: number;
  recAmt: number;
  subDate: string;
  recDate: string;
}> = [
  { ym: "2026-01", salaryExp: 123920, billNo: "2026/01/51/Sales Officer Salary January/DBH-2", billExVat: 140759.13, recAmt: 137944.00, subDate: "2026-01-31", recDate: "2026-02-08" },
  { ym: "2026-02", salaryExp: 98000, eidBonusExp: 66223, billNo: "2026/02/120/Sales Officer Salary February/DBH-2", billExVat: 184760.87, recAmt: 181065.00, subDate: "2026-02-24", recDate: "2026-03-01" },
  { ym: "2026-03", salaryExp: 142147.49, billNo: "2026/03/197/Sales Officer Salary March/DBH-2", billExVat: 160660.00, recAmt: 157447.00, subDate: "2026-03-29", recDate: "2026-03-31" },
  { ym: "2026-04", salaryExp: 122945, billNo: "2026/04/262/Sales Officer Salary April/DBH-2", billExVat: 139693.04, recAmt: 136899.00, subDate: "2026-04-28", recDate: "2026-04-29" },
  { ym: "2026-05", salaryExp: 117303, eidBonusExp: 59000, incentiveExp: 69907, billNo: "2026/05/300/Sales Officer Salary May/DBH-2", billExVat: 275039.12, recAmt: 269538.00, subDate: "2026-05-07", recDate: "2026-05-21" },
  { ym: "2026-06", salaryExp: 107603, billNo: "2026/05/359/Sales Officer Salary June/DBH-2", billExVat: 122943.48, recAmt: 120484.00, subDate: "2026-06-25", recDate: "2026-06-29" },
  { ym: "2026-07", salaryExp: 72488, billNo: "2026/07/420/Sales Officer Salary July/DBH-2", billExVat: 84603.48, recAmt: 83757.00, subDate: "2026-07-24", recDate: "2026-07-28" },
  { ym: "2026-08", salaryExp: 59326, billNo: "2026/08/494/Sales Officer Salary August/DBH-2", billExVat: 70233.04, recAmt: 69531.00, subDate: "2026-08-27", recDate: "2026-08-31" },
  { ym: "2026-09", salaryExp: 82954, billNo: "2026/09/560/Sales Officer Salary September/DBH-2", billExVat: 96029.57, recAmt: 95069.27, subDate: "2026-10-24", recDate: "2026-09-30" },
  { ym: "2026-10", salaryExp: 106862, billNo: "2026/10/636/Sales Officer Salary October/DBH-2", billExVat: 122133.91, recAmt: 120912.57, subDate: "2026-10-26", recDate: "2026-10-31" },
];

const DBH_SO_2026_HISTORY: HistoricalMonthEntry[] = SO_RAW.map((m) => {
  const items: HistoricalItemSpec[] = [
    { costHead: "Sales Officer Salary (with Tax)", costTag: "BILLABLE", isSalary: true, particulars: "Sales Officer Monthly Salary Disbursed", amount: m.salaryExp },
  ];
  if (m.eidBonusExp) {
    items.push({ costHead: "Eid Bonus", costTag: "BILLABLE", isSalary: true, particulars: "Sales Officer Eid Bonus", amount: m.eidBonusExp });
  }
  if (m.incentiveExp) {
    items.push({ costHead: "Incentive / Yearly Commission", costTag: "BILLABLE", isSalary: true, particulars: "Incentive & Yearly Adjustment", amount: m.incentiveExp });
  }
  const aitRate = Number(m.ym.slice(5)) >= 7 ? 0.01 : 0.02;
  const vatAmount = round2(m.billExVat * 0.15);
  const aitAmount = round2(m.billExVat * aitRate);
  return {
    forMonth: m.ym,
    voucherNumber: `IMS-HIST-SO-2026-${m.ym.slice(5)}`,
    poNumber: "As Per Agreement",
    comments: `Historical Jan–Oct 2026 import from DBH Project Sales Officer (${m.ym})`,
    items,
    bills: [
      {
        forMonth: m.ym,
        billNumber: m.billNo,
        poNumber: "As Per Agreement",
        status: "PAID",
        billExVat: m.billExVat,
        vatAmount,
        billWithVat: round2(m.billExVat + vatAmount),
        aitAmount,
        expectedInflow: round2(m.billExVat - aitAmount),
        receivedAmount: m.recAmt,
        submittedAt: m.subDate,
        dueDate: m.subDate,
        receivedAt: m.recDate,
      },
    ],
  };
});

async function seedProjectHistory(params: {
  project: {
    id: string;
    code: string;
    companyId: string;
    headId: string | null;
    billingProfile: string;
    feeRate: unknown;
    aitRate: unknown;
    vatRate: unknown;
    billCycleDays: number;
    funding: string;
    salaryMonthLag: number;
    fixedMonthlyBill: unknown;
    maintenanceBudget: unknown;
    monthlyAmortization: unknown;
    costHeads: unknown;
  };
  entries: HistoricalMonthEntry[];
  maker: { id: string; name: string; designation: string };
}) {
  const { project, entries, maker } = params;
  const meta = extractProjectMeta(project.costHeads);
  if (meta.hist2026ImportedV1 === true) return;

  const existingReqs = await prisma.requisition.findMany({
    where: {
      projectId: project.id,
      forMonth: { in: entries.map((e) => e.forMonth) },
      status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] },
    },
    select: { forMonth: true },
  });
  const occupiedMonths = new Set(existingReqs.map((r) => r.forMonth).filter(Boolean));

  const existingBills = await prisma.clientBill.findMany({
    where: {
      projectId: project.id,
      forMonth: { in: entries.map((e) => e.forMonth) },
    },
    select: { forMonth: true, notes: true },
  });
  const billedMonths = new Set(
    existingBills
      .filter((b) => !String(b.notes || "").startsWith("[OPENING_BALANCE]"))
      .map((b) => b.forMonth)
  );

  const terms: BillingTermsInput = {
    billingProfile: project.billingProfile,
    feeRate: Number(project.feeRate),
    aitRate: Number(project.aitRate),
    aitGrossupRate: meta.aitGrossupRate,
    reimbursementTaxDivisor: meta.reimbursementTaxDivisor,
    fixedKamRecovery: meta.fixedKamRecovery,
    vatRate: Number(project.vatRate),
    billCycleDays: project.billCycleDays,
    funding: project.funding,
    salaryMonthLag: project.salaryMonthLag,
    fixedMonthlyBill: project.fixedMonthlyBill ? Number(project.fixedMonthlyBill) : 0,
    maintenanceBudget: Number(project.maintenanceBudget || 0),
    monthlyAmortization: Number(project.monthlyAmortization || 0),
  };

  for (const entry of entries) {
    const billableTotal = round2(
      entry.items
        .filter((it) => it.costTag === "BILLABLE")
        .reduce((s, it) => s + it.amount, 0)
    );
    const imsTotal = round2(
      entry.items
        .filter((it) => it.costTag === "IMS_INVESTMENT")
        .reduce((s, it) => s + it.amount, 0)
    );
    const grandTotal = round2(billableTotal + imsTotal);
    const histDate = new Date(`${entry.forMonth}-25T10:00:00.000Z`);

    if (!occupiedMonths.has(entry.forMonth)) {
      const existingByNo = await prisma.requisition.findUnique({
        where: { number: entry.voucherNumber },
        select: { id: true },
      });
      if (!existingByNo) {
        const calc = calculateProfitSummary({
          terms,
          billableCost: billableTotal,
          imsInvestment: imsTotal,
        });
        const lag = project.salaryMonthLag ?? 1;
        await prisma.requisition.create({
          data: {
            number: entry.voucherNumber,
            companyId: project.companyId,
            projectId: project.id,
            type: "BPO",
            category: "OUTSOURCING",
            priority: "NORMAL",
            makerId: maker.id,
            makerName: maker.name,
            makerDesignation: maker.designation,
            date: histDate,
            disburseOn: histDate,
            forMonth: entry.forMonth,
            total: grandTotal,
            billableTotal,
            imsInvestmentTotal: imsTotal,
            projectedBillExVat: calc.billExVat,
            projectedNetProfit: calc.netProfit,
            currency: "BDT",
            amountInWords: amountInWords(grandTotal, "BDT"),
            comments: entry.comments,
            paymentMode: "BANK",
            poNumber: entry.poNumber || null,
            source: "MANUAL",
            status: "SETTLED",
            mdStatus: "APPROVED",
            submittedAt: histDate,
            approvedAt: histDate,
            executedAt: histDate,
            createdAt: histDate,
            updatedAt: histDate,
            items: {
              create: entry.items.map((it, idx) => ({
                sl: idx + 1,
                costHead: it.costHead,
                costTag: it.costTag,
                forMonth:
                  it.isSalary && lag === 1
                    ? getPreviousYearMonth(entry.forMonth)
                    : entry.forMonth,
                particulars: it.particulars,
                qty: 1,
                unitPrice: it.amount,
                amount: it.amount,
              })),
            },
          },
        });
      }
    }

    if (entry.bills && entry.bills.length > 0 && !billedMonths.has(entry.forMonth)) {
      for (const b of entry.bills) {
        const totalCost = round2(billableTotal + imsTotal + Number(project.monthlyAmortization || 0) + Number(project.maintenanceBudget || 0));
        await prisma.clientBill.create({
          data: {
            projectId: project.id,
            forMonth: b.forMonth,
            billNumber: b.billNumber,
            poNumber: b.poNumber || null,
            status: b.status,
            billableCost: billableTotal,
            imsInvestment: imsTotal,
            billExVat: b.billExVat,
            vatAmount: b.vatAmount,
            billWithVat: b.billWithVat,
            aitAmount: b.aitAmount,
            expectedInflow: b.expectedInflow,
            receivedAmount: b.receivedAmount,
            accruedNetProfit: round2(b.expectedInflow - totalCost),
            realizedNetProfit: round2(b.receivedAmount - totalCost),
            submittedAt: b.submittedAt ? new Date(`${b.submittedAt}T10:00:00.000Z`) : null,
            dueDate: b.dueDate ? new Date(`${b.dueDate}T10:00:00.000Z`) : null,
            receivedAt: b.receivedAt ? new Date(`${b.receivedAt}T10:00:00.000Z`) : null,
            notes: b.notes || null,
            updatedById: maker.id,
            createdAt: histDate,
            updatedAt: histDate,
          },
        });
      }
    }
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      costHeads: packCostHeadsWithMeta(
        resolveCostHeadsForKind(project.costHeads, false, project.code),
        { ...meta, hist2026ImportedV1: true }
      ) as any,
    },
  });
}

/**
 * Idempotently imports Jan–Oct 2026 historical Excel baseline records for Robi SME,
 * DBH Office Set-up, and DBH Project Sales Officer if not yet imported.
 */
export async function ensureHistorical2026DataImported(): Promise<void> {
  const [robi, dbhOffice, dbhSo] = await Promise.all([
    prisma.project.findFirst({
      where: { code: { in: ["PROJ-ROBI-SME", "PROJ-ROBI"] } },
      orderBy: { code: "desc" }, // Prefer PROJ-ROBI-SME if both exist
    }),
    prisma.project.findUnique({ where: { code: "PROJ-DBH" } }),
    prisma.project.findUnique({ where: { code: "PROJ-SALES-OFFICER" } }),
  ]);

  const targets: Array<{ proj: NonNullable<typeof robi>; data: HistoricalMonthEntry[] }> = [];
  if (robi && extractProjectMeta(robi.costHeads).hist2026ImportedV1 !== true) {
    targets.push({ proj: robi, data: ROBI_2026_HISTORY });
  }
  if (dbhOffice && extractProjectMeta(dbhOffice.costHeads).hist2026ImportedV1 !== true) {
    targets.push({ proj: dbhOffice, data: DBH_OFFICE_2026_HISTORY });
  }
  if (dbhSo && extractProjectMeta(dbhSo.costHeads).hist2026ImportedV1 !== true) {
    targets.push({ proj: dbhSo, data: DBH_SO_2026_HISTORY });
  }

  if (targets.length === 0) return;

  const makerUser =
    (await prisma.user.findFirst({
      where: { employeeId: "1074", active: true },
      select: { id: true, name: true, designation: true },
    })) ||
    (await prisma.user.findFirst({
      where: { active: true },
      orderBy: { priorityLevel: "desc" },
      select: { id: true, name: true, designation: true },
    }));

  if (!makerUser) return;

  for (const t of targets) {
    await seedProjectHistory({
      project: t.proj,
      entries: t.data,
      maker: {
        id: makerUser.id,
        name: makerUser.name,
        designation: makerUser.designation || "KAM",
      },
    });
  }
}
