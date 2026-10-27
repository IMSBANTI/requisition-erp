"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateProfitSummary } from "@/lib/profitEngine";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function formatBDT(n: number) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactBDT(n: number) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const PAYMENT_TOLERANCE_BDT = 10; // §4.4: Treat |deviation| <= BDT 10 as fully paid

type ClientBillItem = {
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
  deviationReason: string;
  notes: string;
};

type RequisitionLineItem = {
  id: string;
  sl: number;
  particulars: string;
  costHead: string;
  costTag: string;
  amount: number;
};

type RequisitionSummaryItem = {
  id: string;
  number: string;
  forMonth: string;
  date: string;
  makerName: string;
  status: string;
  billableCost: number;
  imsInvestment: number;
  total: number;
  remarks?: string;
  items?: RequisitionLineItem[];
  divisionName?: string;
};

type ProjectFinanceItem = {
  id: string;
  code: string;
  name: string;
  companyName: string;
  kind: string;
  headName: string;
  directorName: string;
  budget: number;
  terms: {
    billingProfile: any;
    feeRate: number;
    aitRate: number;
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
  }>;
  bills: ClientBillItem[];
  totalReceivedFromBills: number;
  totalExpectedFromBills: number;
  totalBilledWithVat: number;
};

const BILLING_MODEL_LABELS: Record<string, string> = {
  COST_PLUS: "Cost + Service Fee",
  COST_PLUS_GROSSUP: "Cost + Fee (AIT Gross-Up)",
  COMMISSION: "Direct Commission",
  FIXED_FEE: "Fixed Retainer",
  FIXED_QUOTE: "Fixed Event Quote",
};

const PIE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#ea580c",
];

const MONTH_NAMES = [
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

/**
 * §4.4 Derived Bill Status & Overdue Ageing Helper
 */
function deriveBillStatus(bill: {
  status: string;
  expectedInflow: number;
  receivedAmount: number;
  submittedAt: string;
  dueDate: string;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const expected = Number(bill.expectedInflow || 0);
  const received = Number(bill.receivedAmount || 0);
  const outstanding = Math.max(0, expected - received);

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
        daysOverdue > 0
          ? `Part-Paid (${daysOverdue}d Overdue)`
          : "Part-Paid",
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

/**
 * Helper to compute 12-month & quarterly matrix for any list of projects/events/divisions
 */
function buildMatrixForList(
  list: ProjectFinanceItem[],
  yearStr: string,
  mode: "PROFIT" | "EXPENSE"
) {
  const currentYearMonth = new Date().toISOString().slice(0, 7);

  const rows = list.map((p) => {
    const monthMap: Record<
      string,
      { billable: number; ims: number; hasData: boolean }
    > = {};

    for (const m of p.monthlyBreakdown) {
      if (m.forMonth && m.forMonth.startsWith(yearStr + "-")) {
        monthMap[m.forMonth] = {
          billable: m.billableCost,
          ims: m.imsInvestment,
          hasData: m.reqCount > 0 || m.billableCost > 0 || m.imsInvestment > 0,
        };
      }
    }

    const actualValuesInOrder: number[] = [];
    const cells: Array<{
      monthIndex: number;
      monthKey: string;
      netProfit: number; // In EXPENSE mode, this holds total expense for that month
      billableCost: number;
      imsInvestment: number;
      billExVat: number;
      expectedInflow: number;
      isForecast: boolean;
      hasActual: boolean;
    }> = [];

    for (let i = 0; i < 12; i++) {
      const mKey = `${yearStr}-${String(i + 1).padStart(2, "0")}`;
      const mData = monthMap[mKey];
      if (mData && mData.hasData) {
        if (mode === "EXPENSE") {
          const totalExp = mData.billable + mData.ims;
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
            hasActual: true,
          });
        } else {
          const c = calculateProfitSummary({
            terms: p.terms,
            billableCost: mData.billable,
            imsInvestment: mData.ims,
          });
          actualValuesInOrder.push(c.netProfit);
          cells.push({
            monthIndex: i,
            monthKey: mKey,
            netProfit: c.netProfit,
            billableCost: mData.billable,
            imsInvestment: mData.ims,
            billExVat: c.billExVat,
            expectedInflow: c.expectedInflow,
            isForecast: false,
            hasActual: true,
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
          hasActual: false,
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
      if (
        !cell.hasActual &&
        cell.monthKey > currentYearMonth &&
        forecastMonthlyValue !== null
      ) {
        cell.netProfit = forecastMonthlyValue;
        cell.isForecast = true;
      }
    }

    const actualYtd = cells
      .filter((c) => c.hasActual)
      .reduce((s, c) => s + c.netProfit, 0);
    const totalImsYtd = cells
      .filter((c) => c.hasActual)
      .reduce((s, c) => s + c.imsInvestment, 0);
    const totalBillableYtd = cells
      .filter((c) => c.hasActual)
      .reduce((s, c) => s + c.billableCost, 0);

    const q1 = cells[0].netProfit + cells[1].netProfit + cells[2].netProfit;
    const q2 = cells[3].netProfit + cells[4].netProfit + cells[5].netProfit;
    const q3 = cells[6].netProfit + cells[7].netProfit + cells[8].netProfit;
    const q4 = cells[9].netProfit + cells[10].netProfit + cells[11].netProfit;
    const h1 = q1 + q2;
    const h2 = q3 + q4;
    const fullYearTotal = h1 + h2;
    const activeOrForecastMonths = cells.filter(
      (c) => c.hasActual || c.isForecast
    ).length;
    const monthlyAvg =
      activeOrForecastMonths > 0
        ? fullYearTotal / activeOrForecastMonths
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
    rows.reduce((sum, r) => sum + r.cells[idx].netProfit, 0)
  );
  const grandActualYtd = rows.reduce((s, r) => s + r.actualYtd, 0);
  const grandImsYtd = rows.reduce((s, r) => s + r.totalImsYtd, 0);
  const grandQ1 = rows.reduce((s, r) => s + r.q1, 0);
  const grandQ2 = rows.reduce((s, r) => s + r.q2, 0);
  const grandQ3 = rows.reduce((s, r) => s + r.q3, 0);
  const grandQ4 = rows.reduce((s, r) => s + r.q4, 0);
  const grandH1 = rows.reduce((s, r) => s + r.h1, 0);
  const grandH2 = rows.reduce((s, r) => s + r.h2, 0);
  const grandFullYear = rows.reduce((s, r) => s + r.fullYearTotal, 0);
  const grandMonthlyAvg = grandFullYear / 12;

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

export default function FinanceClient({
  projects,
  canEditFinance,
}: {
  projects: ProjectFinanceItem[];
  canEditFinance: boolean;
}) {
  const router = useRouter();

  // Strictly separate Projects vs Events vs IMS Group Internal Divisions
  const permanentProjects = useMemo(
    () => projects.filter((p) => p.kind === "PERMANENT"),
    [projects]
  );
  const eventProjects = useMemo(
    () => projects.filter((p) => p.kind === "EVENT"),
    [projects]
  );
  const companyDivisions = useMemo(
    () => projects.filter((p) => p.kind === "COMPANY"),
    [projects]
  );

  // Synthetic "All IMS Group Divisions (Combined)" item so user can view all IMS Group overhead at once or pick a single division
  const combinedCompanyItem: ProjectFinanceItem | null = useMemo(() => {
    if (companyDivisions.length === 0) return null;
    const allReqs: RequisitionSummaryItem[] = [];
    const byMonth: Record<
      string,
      {
        forMonth: string;
        billableCost: number;
        imsInvestment: number;
        executedBillable: number;
        executedImsInv: number;
        reqCount: number;
      }
    > = {};

    let totalBillableReq = 0;
    let totalImsInvReq = 0;
    let executedBillable = 0;
    let executedImsInv = 0;

    for (const div of companyDivisions) {
      totalBillableReq += div.totalBillableReq;
      totalImsInvReq += div.totalImsInvReq;
      executedBillable += div.executedBillable;
      executedImsInv += div.executedImsInv;

      for (const r of div.requisitionsList) {
        allReqs.push({
          ...r,
          divisionName: div.name,
        });
      }

      for (const m of div.monthlyBreakdown) {
        if (!byMonth[m.forMonth]) {
          byMonth[m.forMonth] = {
            forMonth: m.forMonth,
            billableCost: 0,
            imsInvestment: 0,
            executedBillable: 0,
            executedImsInv: 0,
            reqCount: 0,
          };
        }
        byMonth[m.forMonth].billableCost += m.billableCost;
        byMonth[m.forMonth].imsInvestment += m.imsInvestment;
        byMonth[m.forMonth].executedBillable += m.executedBillable;
        byMonth[m.forMonth].executedImsInv += m.executedImsInv;
        byMonth[m.forMonth].reqCount += m.reqCount;
      }
    }

    allReqs.sort((a, b) => b.date.localeCompare(a.date));

    return {
      id: "ALL_COMPANY",
      code: "IMS-GROUP-ALL",
      name: "All IMS Group Divisions (Combined Overhead)",
      companyName: "IMS GROUP (IMS, CLAN, SCL, TradePULSE)",
      kind: "COMPANY",
      headName: "All Division Heads",
      directorName: "Board of Directors & MD",
      budget: 0,
      terms: companyDivisions[0].terms,
      reqCount: allReqs.length,
      requisitionsList: allReqs,
      totalBillableReq,
      totalImsInvReq,
      executedBillable,
      executedImsInv,
      overallCalc: companyDivisions[0].overallCalc,
      monthlyBreakdown: Object.values(byMonth).sort((a, b) =>
        b.forMonth.localeCompare(a.forMonth)
      ),
      bills: [],
      totalReceivedFromBills: 0,
      totalExpectedFromBills: 0,
      totalBilledWithVat: 0,
    };
  }, [companyDivisions]);

  const [activeType, setActiveType] = useState<
    "PERMANENT" | "EVENT" | "COMPANY"
  >("PERMANENT");
  const [viewMode, setViewMode] = useState<
    "SINGLE" | "SUMMARY_MATRIX" | "AGEING"
  >("SINGLE");

  const currentList = useMemo(() => {
    if (activeType === "PERMANENT") return permanentProjects;
    if (activeType === "EVENT") return eventProjects;
    return combinedCompanyItem
      ? [combinedCompanyItem, ...companyDivisions]
      : companyDivisions;
  }, [activeType, permanentProjects, eventProjects, companyDivisions, combinedCompanyItem]);

  const [selectedId, setSelectedId] = useState<string>(() => {
    const firstActive =
      permanentProjects.find((p) => p.reqCount > 0 || p.bills.length > 0) ||
      permanentProjects[0];
    return firstActive ? firstActive.id : "";
  });

  useEffect(() => {
    if (!currentList.some((p) => p.id === selectedId)) {
      if (activeType === "COMPANY" && combinedCompanyItem) {
        setSelectedId("ALL_COMPANY");
      } else {
        const firstActive =
          currentList.find((p) => p.reqCount > 0 || p.bills.length > 0) ||
          currentList[0];
        setSelectedId(firstActive ? firstActive.id : "");
      }
    }
  }, [activeType, currentList, selectedId, combinedCompanyItem]);

  // If switching to COMPANY while on AGEING view, switch to SINGLE view (since internal divisions don't issue client bills)
  useEffect(() => {
    if (activeType === "COMPANY" && viewMode === "AGEING") {
      setViewMode("SINGLE");
    }
  }, [activeType, viewMode]);

  const selectedProject = useMemo(
    () =>
      currentList.find((p) => p.id === selectedId) || currentList[0] || null,
    [currentList, selectedId]
  );

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);

  // Management Summary Matrix state (§7.7 & §9)
  const [matrixYear, setMatrixYear] = useState<string>(() =>
    String(new Date().getFullYear())
  );
  const [matrixPeriodView, setMatrixPeriodView] = useState<
    "MONTHLY" | "QUARTERLY"
  >("MONTHLY");

  // Receivables Ageing Filter state (§7.6)
  const [ageingFilter, setAgeingFilter] = useState<string>("ALL");

  useEffect(() => {
    setSelectedMonth("ALL");
    setExpandedReqId(null);
  }, [selectedId]);

  // Modal state for Recording / Editing a Partial or Full Client Payment
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProject, setModalProject] =
    useState<ProjectFinanceItem | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [formMonth, setFormMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [formBillNo, setFormBillNo] = useState("");
  const [formPoNo, setFormPoNo] = useState("");
  const [formStatus, setFormStatus] = useState("PARTIAL_PAID");
  const [formBillableCost, setFormBillableCost] = useState("");
  const [formImsInv, setFormImsInv] = useState("");
  const [formBillExVat, setFormBillExVat] = useState("");
  const [formVatAmt, setFormVatAmt] = useState("");
  const [formAitAmt, setFormAitAmt] = useState("");
  const [formReceivedAmt, setFormReceivedAmt] = useState("");
  const [formSubmittedAt, setFormSubmittedAt] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formReceivedAt, setFormReceivedAt] = useState("");
  const [formDeviation, setFormDeviation] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const availableMonths = useMemo(() => {
    if (!selectedProject) return [];
    const set = new Set<string>();
    for (const m of selectedProject.monthlyBreakdown) {
      if (m.forMonth) set.add(m.forMonth);
    }
    for (const b of selectedProject.bills) {
      if (b.forMonth && b.forMonth !== "ALL") set.add(b.forMonth);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [selectedProject]);

  const availableYears = useMemo(() => {
    const yrs = new Set<string>([
      String(new Date().getFullYear()),
      "2026",
      "2027",
    ]);
    for (const p of projects) {
      for (const m of p.monthlyBreakdown) {
        if (m.forMonth && m.forMonth.length >= 4) {
          yrs.add(m.forMonth.slice(0, 4));
        }
      }
      for (const b of p.bills) {
        if (b.forMonth && b.forMonth.length >= 4 && /^\d{4}/.test(b.forMonth)) {
          yrs.add(b.forMonth.slice(0, 4));
        }
      }
    }
    return Array.from(yrs).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  // Consolidated Group-Wide Totals (Projects Net Profit + Events Net Profit - IMS Group Overhead Expenses)
  const consolidatedGroupStats = useMemo(() => {
    const projMatrix = buildMatrixForList(
      permanentProjects,
      matrixYear,
      "PROFIT"
    );
    const evtMatrix = buildMatrixForList(eventProjects, matrixYear, "PROFIT");
    const compMatrix = buildMatrixForList(
      companyDivisions,
      matrixYear,
      "EXPENSE"
    );

    const totalCompanyAllTimeSpend = companyDivisions.reduce(
      (s, d) => s + d.totalBillableReq + d.totalImsInvReq,
      0
    );
    const totalProjectsAllTimeProfit = permanentProjects.reduce(
      (s, p) => s + Number(p.overallCalc?.netProfit || 0),
      0
    );
    const totalEventsAllTimeProfit = eventProjects.reduce(
      (s, p) => s + Number(p.overallCalc?.netProfit || 0),
      0
    );

    return {
      projMatrix,
      evtMatrix,
      compMatrix,
      totalCompanyAllTimeSpend,
      totalProjectsAllTimeProfit,
      totalEventsAllTimeProfit,
      trueGroupBottomLineAllTime:
        totalProjectsAllTimeProfit +
        totalEventsAllTimeProfit -
        totalCompanyAllTimeSpend,
      trueGroupBottomLineYtd:
        projMatrix.grandActualYtd +
        evtMatrix.grandActualYtd -
        compMatrix.grandActualYtd,
      trueGroupBottomLineFullYear:
        projMatrix.grandFullYear +
        evtMatrix.grandFullYear -
        compMatrix.grandFullYear,
    };
  }, [permanentProjects, eventProjects, companyDivisions, matrixYear]);

  // Filtered Requisitions & Payments for the selected project/event/division and month
  const activeStats = useMemo(() => {
    if (!selectedProject) return null;

    const reqs =
      selectedMonth === "ALL"
        ? selectedProject.requisitionsList
        : selectedProject.requisitionsList.filter(
            (r) => r.forMonth === selectedMonth
          );

    const bills =
      selectedMonth === "ALL"
        ? selectedProject.bills
        : selectedProject.bills.filter((b) => b.forMonth === selectedMonth);

    const billableSpend = reqs.reduce((sum, r) => sum + r.billableCost, 0);
    const imsSpend = reqs.reduce((sum, r) => sum + r.imsInvestment, 0);
    const totalSpend = billableSpend + imsSpend;

    const executedSpend = reqs
      .filter(
        (r) =>
          r.status === "EXECUTED" ||
          r.status === "APPROVED" ||
          r.status === "FORWARDED"
      )
      .reduce((sum, r) => sum + r.total, 0);
    const pendingSpend = Math.max(0, totalSpend - executedSpend);

    const calc = calculateProfitSummary({
      terms: selectedProject.terms,
      billableCost: billableSpend,
      imsInvestment: imsSpend,
    });

    const latestBillWithInvoice = bills.find((b) => b.billExVat > 0);
    const billedExVat = latestBillWithInvoice
      ? latestBillWithInvoice.billExVat
      : calc.billExVat;
    const billedWithVat = latestBillWithInvoice
      ? latestBillWithInvoice.billWithVat
      : calc.billWithVat;
    const expectedInflow = latestBillWithInvoice
      ? latestBillWithInvoice.expectedInflow
      : calc.expectedInflow;

    const receivedAmount = bills.reduce((sum, b) => sum + b.receivedAmount, 0);
    const rawDue = Math.max(0, expectedInflow - receivedAmount);
    const remainingDue = rawDue <= PAYMENT_TOLERANCE_BDT ? 0 : rawDue;
    const deviation = receivedAmount - expectedInflow;

    const accruedProfit = calc.netProfit;
    const realizedProfit =
      receivedAmount -
      totalSpend -
      calc.amortizationCost -
      calc.maintenanceCost;
    const collectionPercent =
      expectedInflow > 0
        ? remainingDue === 0
          ? 100
          : Math.min(100, Math.round((receivedAmount / expectedInflow) * 100))
        : 0;

    const distinctMonths = new Set(reqs.map((r) => r.forMonth)).size || 1;
    const monthlyAvgSpend = totalSpend / distinctMonths;

    return {
      reqs,
      bills,
      billableSpend,
      imsSpend,
      totalSpend,
      executedSpend,
      pendingSpend,
      monthlyAvgSpend,
      calc,
      billedExVat,
      billedWithVat,
      expectedInflow,
      receivedAmount,
      remainingDue,
      deviation,
      accruedProfit,
      realizedProfit,
      collectionPercent,
    };
  }, [selectedProject, selectedMonth]);

  // Active matrix for the currently selected tab (`PERMANENT` | `EVENT` | `COMPANY`)
  const managementMatrix = useMemo(() => {
    if (activeType === "PERMANENT") {
      return consolidatedGroupStats.projMatrix;
    }
    if (activeType === "EVENT") {
      return consolidatedGroupStats.evtMatrix;
    }
    return consolidatedGroupStats.compMatrix;
  }, [activeType, consolidatedGroupStats]);

  // ============================================================================
  // §4.4 & §7.6: RECEIVABLES & OVERDUE AGEING TRACKER
  // ============================================================================
  const receivablesAgeing = useMemo(() => {
    const allBillRows: Array<{
      bill: ClientBillItem;
      project: ProjectFinanceItem;
      derived: ReturnType<typeof deriveBillStatus>;
    }> = [];

    for (const p of currentList) {
      if (p.id === "ALL_COMPANY") continue;
      for (const b of p.bills) {
        const derived = deriveBillStatus(b);
        allBillRows.push({ bill: b, project: p, derived });
      }
    }

    allBillRows.sort((a, b) => {
      if (b.derived.daysOverdue !== a.derived.daysOverdue) {
        return b.derived.daysOverdue - a.derived.daysOverdue;
      }
      return b.derived.outstanding - a.derived.outstanding;
    });

    let notYetDueTotal = 0;
    let dueSoonTotal = 0;
    let overdue1To30Total = 0;
    let overdue31To60Total = 0;
    let overdue60PlusTotal = 0;

    let notYetDueCount = 0;
    let dueSoonCount = 0;
    let overdue1To30Count = 0;
    let overdue31To60Count = 0;
    let overdue60PlusCount = 0;

    for (const row of allBillRows) {
      if (row.derived.code === "PAID" || row.derived.outstanding <= 0) continue;
      const out = row.derived.outstanding;
      switch (row.derived.ageingBucket) {
        case "NOT_YET_DUE":
          notYetDueTotal += out;
          notYetDueCount++;
          break;
        case "DUE_SOON":
          dueSoonTotal += out;
          dueSoonCount++;
          break;
        case "OVERDUE_1_30":
          overdue1To30Total += out;
          overdue1To30Count++;
          break;
        case "OVERDUE_31_60":
          overdue31To60Total += out;
          overdue31To60Count++;
          break;
        case "OVERDUE_60_PLUS":
          overdue60PlusTotal += out;
          overdue60PlusCount++;
          break;
      }
    }

    const filteredRows =
      ageingFilter === "ALL"
        ? allBillRows
        : ageingFilter === "PAID"
        ? allBillRows.filter((r) => r.derived.code === "PAID")
        : allBillRows.filter(
            (r) =>
              r.derived.code !== "PAID" &&
              r.derived.ageingBucket === ageingFilter
          );

    return {
      allBillRows,
      filteredRows,
      notYetDueTotal,
      dueSoonTotal,
      overdue1To30Total,
      overdue31To60Total,
      overdue60PlusTotal,
      notYetDueCount,
      dueSoonCount,
      overdue1To30Count,
      overdue31To60Count,
      overdue60PlusCount,
    };
  }, [currentList, ageingFilter]);

  // 1. Monthly Chart Data for Selected Project/Event/Division
  const monthlyChartData = useMemo(() => {
    if (!selectedProject) return [];
    const map: Record<
      string,
      {
        month: string;
        billableCost: number;
        imsInvestment: number;
        totalCost: number;
        receivedAmount: number;
      }
    > = {};

    for (const r of selectedProject.requisitionsList) {
      const m = r.forMonth || "Overall";
      if (!map[m]) {
        map[m] = {
          month: m,
          billableCost: 0,
          imsInvestment: 0,
          totalCost: 0,
          receivedAmount: 0,
        };
      }
      map[m].billableCost += r.billableCost;
      map[m].imsInvestment += r.imsInvestment;
      map[m].totalCost += r.billableCost + r.imsInvestment;
    }

    for (const b of selectedProject.bills) {
      const m = b.forMonth || "Overall";
      if (!map[m]) {
        map[m] = {
          month: m,
          billableCost: 0,
          imsInvestment: 0,
          totalCost: 0,
          receivedAmount: 0,
        };
      }
      map[m].receivedAmount += b.receivedAmount;
    }

    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => {
        if (selectedProject.kind === "COMPANY") {
          return {
            ...row,
            expectedInflow: 0,
            accruedProfit: 0,
          };
        }
        const c = calculateProfitSummary({
          terms: selectedProject.terms,
          billableCost: row.billableCost,
          imsInvestment: row.imsInvestment,
        });
        return {
          ...row,
          expectedInflow: Math.round(c.expectedInflow),
          accruedProfit: Math.round(c.netProfit),
        };
      });
  }, [selectedProject]);

  // 2. Cost Head Breakdown Pie Data for Selected Project/Event/Division
  const costHeadPieData = useMemo(() => {
    if (!activeStats) return [];
    const map: Record<string, number> = {};
    for (const r of activeStats.reqs) {
      if (r.items && r.items.length > 0) {
        for (const it of r.items) {
          const head =
            it.costHead && it.costHead !== "Uncategorized"
              ? it.costHead
              : it.particulars.slice(0, 28) || "General Expense";
          map[head] = (map[head] || 0) + it.amount;
        }
      } else {
        const label =
          r.divisionName ||
          (r.billableCost > 0 ? "General Requisition Spend" : "IMS Expense");
        map[label] = (map[label] || 0) + r.total;
      }
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [activeStats]);

  // 3. Requisition-by-Requisition Bar Data
  const reqBarData = useMemo(() => {
    if (!activeStats) return [];
    return activeStats.reqs
      .slice()
      .reverse()
      .map((r) => ({
        name: r.number,
        date: r.date,
        Billable: r.billableCost,
        IMS_Investment: r.imsInvestment,
        Total: r.total,
      }));
  }, [activeStats]);

  function computeDueDateStr(submittedDateStr: string, cycleDays: number) {
    if (!submittedDateStr) return "";
    const d = new Date(submittedDateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + (cycleDays || 30));
    return d.toISOString().slice(0, 10);
  }

  function openPaymentModal(
    existingBill?: ClientBillItem,
    targetProject?: ProjectFinanceItem
  ) {
    const proj = targetProject || selectedProject;
    if (!proj || proj.id === "ALL_COMPANY") return;
    setModalProject(proj);

    if (existingBill) {
      setEditingBillId(existingBill.id);
      setFormMonth(existingBill.forMonth);
      setFormBillNo(existingBill.billNumber || "");
      setFormPoNo(existingBill.poNumber || "");
      setFormStatus(existingBill.status || "PARTIAL_PAID");
      setFormBillableCost(String(existingBill.billableCost));
      setFormImsInv(String(existingBill.imsInvestment));
      setFormBillExVat(String(existingBill.billExVat));
      setFormVatAmt(String(existingBill.vatAmount));
      setFormAitAmt(String(existingBill.aitAmount));
      setFormReceivedAmt(String(existingBill.receivedAmount));
      setFormSubmittedAt(existingBill.submittedAt || "");
      setFormDueDate(existingBill.dueDate || "");
      setFormReceivedAt(existingBill.receivedAt || "");
      setFormDeviation(existingBill.deviationReason || "");
      setFormNotes(existingBill.notes || "");
    } else {
      setEditingBillId(null);
      const m =
        selectedMonth !== "ALL"
          ? selectedMonth
          : proj.kind === "EVENT"
          ? "EVENT-TOTAL"
          : new Date().toISOString().slice(0, 7);
      setFormMonth(m);
      setFormBillNo("");
      setFormPoNo("");
      setFormStatus("PARTIAL_PAID");

      const bSpend =
        proj.id === selectedProject?.id && activeStats
          ? activeStats.billableSpend
          : proj.totalBillableReq;
      const iSpend =
        proj.id === selectedProject?.id && activeStats
          ? activeStats.imsSpend
          : proj.totalImsInvReq;
      const c = calculateProfitSummary({
        terms: proj.terms,
        billableCost: bSpend,
        imsInvestment: iSpend,
      });

      setFormBillableCost(String(bSpend.toFixed(2)));
      setFormImsInv(String(iSpend.toFixed(2)));
      setFormBillExVat(String(c.billExVat.toFixed(2)));
      setFormVatAmt(String(c.vatAmount.toFixed(2)));
      setFormAitAmt(String(c.aitDeducted.toFixed(2)));
      setFormReceivedAmt("");
      const todayStr = new Date().toISOString().slice(0, 10);
      setFormSubmittedAt(todayStr);
      setFormDueDate(computeDueDateStr(todayStr, proj.terms.billCycleDays));
      setFormReceivedAt(todayStr);
      setFormDeviation("");
      setFormNotes(
        `Installment #${proj.bills.length + 1} for ${proj.name}`
      );
    }
    setModalOpen(true);
  }

  function handleAutoRecalculate(newBillableStr: string, newImsStr: string) {
    setFormBillableCost(newBillableStr);
    setFormImsInv(newImsStr);
    const proj = modalProject || selectedProject;
    if (!proj) return;
    const c = calculateProfitSummary({
      terms: proj.terms,
      billableCost: Number(newBillableStr || 0),
      imsInvestment: Number(newImsStr || 0),
    });
    setFormBillExVat(String(c.billExVat.toFixed(2)));
    setFormVatAmt(String(c.vatAmount.toFixed(2)));
    setFormAitAmt(String(c.aitDeducted.toFixed(2)));
  }

  async function handleSaveBill(e: React.FormEvent) {
    e.preventDefault();
    const proj = modalProject || selectedProject;
    if (!proj || proj.id === "ALL_COMPANY") return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingBillId || undefined,
          projectId: proj.id,
          forMonth: formMonth,
          billNumber: formBillNo,
          poNumber: formPoNo,
          status: formStatus,
          billableCost: Number(formBillableCost || 0),
          imsInvestment: Number(formImsInv || 0),
          billExVat: Number(formBillExVat || 0),
          vatAmount: Number(formVatAmt || 0),
          aitAmount: Number(formAitAmt || 0),
          receivedAmount: Number(formReceivedAmt || 0),
          submittedAt: formSubmittedAt || null,
          dueDate: formDueDate || null,
          receivedAt: formReceivedAt || null,
          deviationReason: formDeviation,
          notes: formNotes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save payment record");
        return;
      }
      setModalOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBill(id: string) {
    if (!confirm("Delete this payment / bill record?")) return;
    const res = await fetch(`/api/finance/bills?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.refresh();
    } else {
      alert("Failed to delete payment record.");
    }
  }

  // ============================================================================
  // §7.7: EXCEL EXPORT OF MANAGEMENT PROFIT SUMMARY (.xls SpreadsheetML)
  // ============================================================================
  function handleExportManagementExcel() {
    const titleLabel =
      activeType === "PERMANENT"
        ? `IMS Management Profit Summary — Projects (${matrixYear})`
        : activeType === "EVENT"
        ? `IMS Management Profit Summary — Events (${matrixYear})`
        : `IMS Group Internal Overhead Expenses Summary (${matrixYear})`;

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; margin-bottom: 18px; }
          th { background-color: #1F4E8C; color: #ffffff; font-weight: bold; padding: 6px 8px; border: 1px solid #cbd5e1; }
          td { padding: 5px 8px; border: 1px solid #cbd5e1; }
          .num { text-align: right; mso-number-format:"\\#\\,\\#\\#0\\.00"; }
          .forecast { background-color: #fef3c7; color: #92400e; font-style: italic; }
          .total-row td { background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #0f172a; }
        </style>
      </head>
      <body>
        <h2>${titleLabel}</h2>
        <p>Generated on ${new Date().toISOString().slice(0, 10)} • Highlighted cells indicate Auto-Forecast (avg of last 3 active months)</p>

        <h3>Consolidated IMS Group Bottom-Line (${matrixYear})</h3>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Actual YTD (${matrixYear})</th>
              <th>Full Year Projected (${matrixYear})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1. Projects Net Profit</td>
              <td class="num">${consolidatedGroupStats.projMatrix.grandActualYtd.toFixed(2)}</td>
              <td class="num">${consolidatedGroupStats.projMatrix.grandFullYear.toFixed(2)}</td>
            </tr>
            <tr>
              <td>2. Events Net Profit</td>
              <td class="num">${consolidatedGroupStats.evtMatrix.grandActualYtd.toFixed(2)}</td>
              <td class="num">${consolidatedGroupStats.evtMatrix.grandFullYear.toFixed(2)}</td>
            </tr>
            <tr>
              <td>3. Less: IMS Group Internal Overhead Expenses</td>
              <td class="num">-${consolidatedGroupStats.compMatrix.grandActualYtd.toFixed(2)}</td>
              <td class="num">-${consolidatedGroupStats.compMatrix.grandFullYear.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>IMS GROUP TRUE NET BOTTOM-LINE PROFIT / LOSS</td>
              <td class="num">${consolidatedGroupStats.trueGroupBottomLineYtd.toFixed(2)}</td>
              <td class="num">${consolidatedGroupStats.trueGroupBottomLineFullYear.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>${
                activeType === "PERMANENT"
                  ? "Project Name"
                  : activeType === "EVENT"
                  ? "Event Name"
                  : "Division / Company Unit"
              }</th>
              <th>Model / Type</th>
              ${MONTH_NAMES.map((m) => `<th>${m} ${matrixYear}</th>`).join("")}
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
              <th>Q4</th>
              <th>H1</th>
              <th>H2</th>
              <th>Actual YTD</th>
              <th>Full Year (w/ Forecast)</th>
              <th>Monthly Avg</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const row of managementMatrix.rows) {
      html += `<tr>
        <td>${row.project.code}</td>
        <td>${row.project.name}</td>
        <td>${
          activeType === "COMPANY"
            ? "IMS GROUP OVERHEAD"
            : row.project.terms.billingProfile
        }</td>
        ${row.cells
          .map(
            (c) =>
              `<td class="num ${c.isForecast ? "forecast" : ""}">${c.netProfit.toFixed(
                2
              )}</td>`
          )
          .join("")}
        <td class="num">${row.q1.toFixed(2)}</td>
        <td class="num">${row.q2.toFixed(2)}</td>
        <td class="num">${row.q3.toFixed(2)}</td>
        <td class="num">${row.q4.toFixed(2)}</td>
        <td class="num">${row.h1.toFixed(2)}</td>
        <td class="num">${row.h2.toFixed(2)}</td>
        <td class="num">${row.actualYtd.toFixed(2)}</td>
        <td class="num"><strong>${row.fullYearTotal.toFixed(2)}</strong></td>
        <td class="num">${row.monthlyAvg.toFixed(2)}</td>
      </tr>`;
    }

    html += `<tr class="total-row">
      <td colspan="3">TOTAL (${managementMatrix.rows.length})</td>
      ${managementMatrix.monthTotals
        .map((tot) => `<td class="num">${tot.toFixed(2)}</td>`)
        .join("")}
      <td class="num">${managementMatrix.grandQ1.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandQ2.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandQ3.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandQ4.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandH1.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandH2.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandActualYtd.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandFullYear.toFixed(2)}</td>
      <td class="num">${managementMatrix.grandMonthlyAvg.toFixed(2)}</td>
    </tr>`;

    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IMS_Finance_Summary_${activeType}_${matrixYear}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const liveBillWithVat =
    Number(formBillExVat || 0) + Number(formVatAmt || 0);
  const liveExpectedInflow =
    Number(formBillExVat || 0) - Number(formAitAmt || 0);
  const liveDeviation =
    Number(formReceivedAmt || 0) - liveExpectedInflow;

  return (
    <div className="mt-5 space-y-6">
      {/* STEP 1: CLEAN SELECTOR BAR (PROJECTS vs EVENTS vs IMS GROUP EXPENSES + VIEW SWITCHER + DROPDOWN + PERIOD) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* Top Row: Projects / Events / IMS Group Toggle + View Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
          {/* 1A. Toggle between Projects, Events, and IMS Group Expenses */}
          <div className="inline-flex flex-wrap bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setActiveType("PERMANENT")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === "PERMANENT"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📁 Projects ({permanentProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveType("EVENT")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === "EVENT"
                  ? "bg-purple-700 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              🎪 Events ({eventProjects.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveType("COMPANY")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeType === "COMPANY"
                  ? "bg-rose-700 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              🏢 IMS Group Expenses ({companyDivisions.length})
            </button>
          </div>

          {/* 1B. View Mode Switcher */}
          <div className="inline-flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            <button
              type="button"
              onClick={() => setViewMode("SINGLE")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "SINGLE"
                  ? "bg-blue-700 text-white shadow-sm"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              🔍 Single{" "}
              {activeType === "PERMANENT"
                ? "Project"
                : activeType === "EVENT"
                ? "Event"
                : "Division"}{" "}
              View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("SUMMARY_MATRIX")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === "SUMMARY_MATRIX"
                  ? "bg-blue-700 text-white shadow-sm"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              📊 Management Summary (12M & Group P&L)
            </button>
            {activeType !== "COMPANY" && (
              <button
                type="button"
                onClick={() => setViewMode("AGEING")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "AGEING"
                    ? "bg-blue-700 text-white shadow-sm"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                ⏰ Receivables & Overdue Ageing
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row of Selector Bar: Context Controls for Current View Mode */}
        {viewMode === "SINGLE" && (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <label className="text-xs font-bold text-gray-700 whitespace-nowrap shrink-0">
                {activeType === "PERMANENT"
                  ? "Select Project:"
                  : activeType === "EVENT"
                  ? "Select Event:"
                  : "Select Division:"}
              </label>
              <select
                value={selectedProject?.id || ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-10 w-full rounded-lg border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-900 shadow-sm focus:border-blue-600 focus:outline-none"
              >
                {currentList.length === 0 ? (
                  <option value="">No Items Found</option>
                ) : (
                  currentList.map((p) => {
                    const totalSpend = p.totalBillableReq + p.totalImsInvReq;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.id === "ALL_COMPANY" ? "🏢 " : ""}
                        {p.name} ({p.code}) — {p.reqCount} Req(s)
                        {totalSpend > 0 ? ` • Tk ${formatBDT(totalSpend)}` : ""}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {selectedProject && (
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                  Period:
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-10 rounded-lg border-2 border-gray-300 bg-white px-3 text-xs font-bold text-gray-800 shadow-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="ALL">All Months (Cumulative)</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {viewMode === "SUMMARY_MATRIX" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-700">Year:</label>
                <select
                  value={matrixYear}
                  onChange={(e) => setMatrixYear(e.target.value)}
                  className="h-9 rounded-lg border-2 border-gray-300 bg-white px-3 text-xs font-bold text-gray-900"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setMatrixPeriodView("MONTHLY")}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${
                    matrixPeriodView === "MONTHLY"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600"
                  }`}
                >
                  12 Months (Jan–Dec)
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixPeriodView("QUARTERLY")}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${
                    matrixPeriodView === "QUARTERLY"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600"
                  }`}
                >
                  Quarterly & Half-Year (Q1–Q4, H1/H2)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportManagementExcel}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition-colors"
            >
              📥 Export Management Summary (.xls)
            </button>
          </div>
        )}

        {viewMode === "AGEING" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Automatic maturity calculation:{" "}
              <strong>Due Date = Submitted Date + Project Cycle Days</strong>{" "}
              (with <strong>±10 BDT</strong> rounding tolerance for Paid status).
            </div>
            {ageingFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setAgeingFilter("ALL")}
                className="text-xs font-bold text-blue-700 underline"
              >
                Show All Bills ({receivablesAgeing.allBillRows.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================
          VIEW MODE 2: MANAGEMENT PROFIT SUMMARY MATRIX (§7.7 & §9 + CONSOLIDATED GROUP P&L)
         ======================================================================== */}
      {viewMode === "SUMMARY_MATRIX" && (
        <div className="space-y-5">
          {/* CONSOLIDATED IMS GROUP BOTTOM-LINE BANNER (Projects Profit + Events Profit - IMS Group Overhead) */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-700">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  🏦 Consolidated IMS Group Bottom-Line Summary ({matrixYear})
                </h3>
                <p className="text-[11px] text-slate-400">
                  True Group Net Profit = (Projects Net Profit + Events Net Profit) − IMS Group Internal Overhead Expenses
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-700">
                <div className="text-[10px] font-bold text-blue-300 uppercase">
                  1. 📁 Projects Net Profit ({matrixYear})
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  Tk {formatBDT(consolidatedGroupStats.projMatrix.grandActualYtd)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Full-Year w/ Forecast: Tk{" "}
                  {formatCompactBDT(
                    consolidatedGroupStats.projMatrix.grandFullYear
                  )}
                </div>
              </div>

              <div className="bg-slate-800/90 rounded-lg p-3 border border-slate-700">
                <div className="text-[10px] font-bold text-purple-300 uppercase">
                  2. 🎪 Events Net Profit ({matrixYear})
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  Tk {formatBDT(consolidatedGroupStats.evtMatrix.grandActualYtd)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Full-Year w/ Forecast: Tk{" "}
                  {formatCompactBDT(
                    consolidatedGroupStats.evtMatrix.grandFullYear
                  )}
                </div>
              </div>

              <div className="bg-rose-950/60 rounded-lg p-3 border border-rose-800/60">
                <div className="text-[10px] font-bold text-rose-300 uppercase">
                  3. ➖ 🏢 IMS Group Internal Expenses
                </div>
                <div className="text-base font-bold text-rose-200 mt-0.5">
                  −Tk{" "}
                  {formatBDT(consolidatedGroupStats.compMatrix.grandActualYtd)}
                </div>
                <div className="text-[10px] text-rose-300/80 mt-0.5">
                  HO, IT, Studio, BD, CLAN, SCL, TP Overhead
                </div>
              </div>

              <div
                className={`rounded-lg p-3 border ${
                  consolidatedGroupStats.trueGroupBottomLineYtd >= 0
                    ? "bg-emerald-950/80 border-emerald-600"
                    : "bg-red-950/80 border-red-600"
                }`}
              >
                <div className="text-[10px] font-bold text-emerald-300 uppercase">
                  4. ＝ True IMS Group Net Profit
                </div>
                <div className="text-base font-bold text-white mt-0.5">
                  {consolidatedGroupStats.trueGroupBottomLineYtd >= 0
                    ? "+"
                    : ""}
                  Tk {formatBDT(consolidatedGroupStats.trueGroupBottomLineYtd)}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Full-Year Projected: Tk{" "}
                  {formatCompactBDT(
                    consolidatedGroupStats.trueGroupBottomLineFullYear
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Management Summary Matrix Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50/70">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  📊{" "}
                  {activeType === "COMPANY"
                    ? `IMS Group Internal Overhead Expenses Matrix — ${matrixYear}`
                    : `Management Net Profit Summary — ${
                        activeType === "PERMANENT" ? "Projects" : "Events"
                      } (${matrixYear})`}
                </h3>
                <p className="text-xs text-gray-500">
                  Click any row name to drill down into its requisitions.{" "}
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold ml-1">
                    Amber tinted = Auto-Forecast (§9)
                  </span>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-800 text-white uppercase">
                  <tr>
                    <th className="py-2.5 px-3 sticky left-0 bg-slate-800 z-10 min-w-[180px]">
                      {activeType === "PERMANENT"
                        ? "Project"
                        : activeType === "EVENT"
                        ? "Event"
                        : "IMS Group Division"}
                    </th>
                    <th className="py-2.5 px-2">
                      {activeType === "COMPANY" ? "Company" : "Model"}
                    </th>
                    {matrixPeriodView === "MONTHLY" ? (
                      MONTH_NAMES.map((m) => (
                        <th key={m} className="py-2.5 px-2 text-right">
                          {m}
                        </th>
                      ))
                    ) : (
                      <>
                        <th className="py-2.5 px-2.5 text-right">Q1</th>
                        <th className="py-2.5 px-2.5 text-right">Q2</th>
                        <th className="py-2.5 px-2.5 text-right">Q3</th>
                        <th className="py-2.5 px-2.5 text-right">Q4</th>
                        <th className="py-2.5 px-2.5 text-right bg-slate-700">
                          H1
                        </th>
                        <th className="py-2.5 px-2.5 text-right bg-slate-700">
                          H2
                        </th>
                      </>
                    )}
                    <th className="py-2.5 px-2.5 text-right bg-slate-900">
                      Actual YTD
                    </th>
                    <th className="py-2.5 px-2.5 text-right bg-blue-900">
                      Full Year
                    </th>
                    <th className="py-2.5 px-2.5 text-right">Avg / Mo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {managementMatrix.rows.map((row) => (
                    <tr key={row.project.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 sticky left-0 bg-white font-bold text-gray-900 border-r border-gray-100">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(row.project.id);
                            setViewMode("SINGLE");
                          }}
                          className="text-left text-blue-700 hover:underline font-bold"
                        >
                          {row.project.name}
                        </button>
                        <div className="text-[10px] font-mono text-gray-400">
                          {row.project.code}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-[10px] font-mono text-gray-600">
                        {activeType === "COMPANY"
                          ? row.project.companyName
                          : row.project.terms.billingProfile}
                      </td>
                      {matrixPeriodView === "MONTHLY" ? (
                        row.cells.map((c) => (
                          <td
                            key={c.monthKey}
                            className={`py-2.5 px-2 text-right font-mono ${
                              c.isForecast
                                ? "bg-amber-50/70 text-amber-900 italic"
                                : c.hasActual
                                ? activeType === "COMPANY"
                                  ? "text-rose-800 font-semibold"
                                  : c.netProfit >= 0
                                  ? "text-gray-900 font-semibold"
                                  : "text-red-700 font-semibold"
                                : "text-gray-300"
                            }`}
                          >
                            {c.hasActual || c.isForecast
                              ? formatCompactBDT(c.netProfit)
                              : "—"}
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="py-2.5 px-2.5 text-right font-mono">
                            {formatCompactBDT(row.q1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono">
                            {formatCompactBDT(row.q2)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono">
                            {formatCompactBDT(row.q3)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono">
                            {formatCompactBDT(row.q4)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-semibold bg-gray-50">
                            {formatCompactBDT(row.h1)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-semibold bg-gray-50">
                            {formatCompactBDT(row.h2)}
                          </td>
                        </>
                      )}
                      <td
                        className={`py-2.5 px-2.5 text-right font-mono font-bold ${
                          activeType === "COMPANY"
                            ? "text-rose-900 bg-rose-50/40"
                            : "text-emerald-800 bg-emerald-50/30"
                        }`}
                      >
                        {formatCompactBDT(row.actualYtd)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono font-bold text-blue-950 bg-blue-50/40">
                        {formatCompactBDT(row.fullYearTotal)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-gray-600">
                        {formatCompactBDT(row.monthlyAvg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-400 font-bold text-gray-900">
                  <tr>
                    <td
                      colSpan={2}
                      className="py-3 px-3 sticky left-0 bg-slate-100"
                    >
                      TOTAL ({managementMatrix.rows.length}{" "}
                      {activeType === "PERMANENT"
                        ? "Projects"
                        : activeType === "EVENT"
                        ? "Events"
                        : "Divisions"}
                      )
                    </td>
                    {matrixPeriodView === "MONTHLY" ? (
                      managementMatrix.monthTotals.map((tot, idx) => (
                        <td key={idx} className="py-3 px-2 text-right font-mono">
                          {formatCompactBDT(tot)}
                        </td>
                      ))
                    ) : (
                      <>
                        <td className="py-3 px-2.5 text-right font-mono">
                          {formatCompactBDT(managementMatrix.grandQ1)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono">
                          {formatCompactBDT(managementMatrix.grandQ2)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono">
                          {formatCompactBDT(managementMatrix.grandQ3)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono">
                          {formatCompactBDT(managementMatrix.grandQ4)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono bg-slate-200/70">
                          {formatCompactBDT(managementMatrix.grandH1)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono bg-slate-200/70">
                          {formatCompactBDT(managementMatrix.grandH2)}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-2.5 text-right font-mono text-emerald-900 bg-emerald-100/60">
                      Tk {formatCompactBDT(managementMatrix.grandActualYtd)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono text-blue-950 bg-blue-100/60">
                      Tk {formatCompactBDT(managementMatrix.grandFullYear)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono">
                      Tk {formatCompactBDT(managementMatrix.grandMonthlyAvg)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          VIEW MODE 3: RECEIVABLES & OVERDUE AGEING TRACKER (§4.4 & §7.6)
         ======================================================================== */}
      {viewMode === "AGEING" && (
        <div className="space-y-5">
          {/* 5 Ageing Bucket Tiles (§7.6) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() =>
                setAgeingFilter(
                  ageingFilter === "NOT_YET_DUE" ? "ALL" : "NOT_YET_DUE"
                )
              }
              className={`text-left rounded-xl p-4 border shadow-sm transition-all ${
                ageingFilter === "NOT_YET_DUE"
                  ? "ring-2 ring-blue-600 bg-blue-50 border-blue-300"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="text-[11px] font-bold text-blue-700 uppercase">
                1. Not Yet Due (&gt;7d)
              </div>
              <div className="text-base font-bold text-gray-900 mt-1">
                Tk {formatBDT(receivablesAgeing.notYetDueTotal)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {receivablesAgeing.notYetDueCount} active bill(s)
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setAgeingFilter(
                  ageingFilter === "DUE_SOON" ? "ALL" : "DUE_SOON"
                )
              }
              className={`text-left rounded-xl p-4 border shadow-sm transition-all ${
                ageingFilter === "DUE_SOON"
                  ? "ring-2 ring-orange-600 bg-orange-50 border-orange-300"
                  : "bg-orange-50/40 border-orange-200 hover:bg-orange-50"
              }`}
            >
              <div className="text-[11px] font-bold text-orange-800 uppercase">
                2. Due Soon (≤7 Days)
              </div>
              <div className="text-base font-bold text-orange-950 mt-1">
                Tk {formatBDT(receivablesAgeing.dueSoonTotal)}
              </div>
              <div className="text-[11px] text-orange-700 mt-0.5">
                {receivablesAgeing.dueSoonCount} bill(s) maturing soon
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setAgeingFilter(
                  ageingFilter === "OVERDUE_1_30" ? "ALL" : "OVERDUE_1_30"
                )
              }
              className={`text-left rounded-xl p-4 border shadow-sm transition-all ${
                ageingFilter === "OVERDUE_1_30"
                  ? "ring-2 ring-amber-600 bg-amber-100 border-amber-400"
                  : "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
              }`}
            >
              <div className="text-[11px] font-bold text-amber-900 uppercase">
                3. Overdue 1–30 Days
              </div>
              <div className="text-base font-bold text-amber-950 mt-1">
                Tk {formatBDT(receivablesAgeing.overdue1To30Total)}
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                {receivablesAgeing.overdue1To30Count} bill(s) overdue
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setAgeingFilter(
                  ageingFilter === "OVERDUE_31_60" ? "ALL" : "OVERDUE_31_60"
                )
              }
              className={`text-left rounded-xl p-4 border shadow-sm transition-all ${
                ageingFilter === "OVERDUE_31_60"
                  ? "ring-2 ring-red-600 bg-red-100 border-red-400"
                  : "bg-red-50/50 border-red-200 hover:bg-red-50"
              }`}
            >
              <div className="text-[11px] font-bold text-red-800 uppercase">
                4. Overdue 31–60 Days
              </div>
              <div className="text-base font-bold text-red-950 mt-1">
                Tk {formatBDT(receivablesAgeing.overdue31To60Total)}
              </div>
              <div className="text-[11px] text-red-700 mt-0.5">
                {receivablesAgeing.overdue31To60Count} bill(s) overdue
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setAgeingFilter(
                  ageingFilter === "OVERDUE_60_PLUS" ? "ALL" : "OVERDUE_60_PLUS"
                )
              }
              className={`text-left rounded-xl p-4 border shadow-sm transition-all ${
                ageingFilter === "OVERDUE_60_PLUS"
                  ? "ring-2 ring-rose-700 bg-rose-100 border-rose-400"
                  : "bg-rose-50/70 border-rose-300 hover:bg-rose-100/70"
              }`}
            >
              <div className="text-[11px] font-bold text-rose-900 uppercase">
                5. Over 60 Days Overdue
              </div>
              <div className="text-base font-bold text-rose-950 mt-1">
                Tk {formatBDT(receivablesAgeing.overdue60PlusTotal)}
              </div>
              <div className="text-[11px] text-rose-800 mt-0.5">
                {receivablesAgeing.overdue60PlusCount} critical bill(s)
              </div>
            </button>
          </div>

          {/* Receivables & Bills Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  ⏰ Client Bills, Maturity Dates & Overdue Receivables (
                  {receivablesAgeing.filteredRows.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Click any tile above to filter by ageing bucket. Status is derived automatically from Submitted Date, Due Date, and Received Amount.
                </p>
              </div>
            </div>

            {receivablesAgeing.filteredRows.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-500">
                No client bills match the selected ageing bucket.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Project / Event</th>
                      <th className="py-2.5 px-3">Month & Ref #</th>
                      <th className="py-2.5 px-3">Submitted → Due Date</th>
                      <th className="py-2.5 px-3">Derived Status</th>
                      <th className="py-2.5 px-3 text-right">
                        Expected Inflow
                      </th>
                      <th className="py-2.5 px-3 text-right">Received</th>
                      <th className="py-2.5 px-3 text-right">
                        Outstanding Due
                      </th>
                      {canEditFinance && (
                        <th className="py-2.5 px-3 text-right">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {receivablesAgeing.filteredRows.map(
                      ({ bill, project, derived }) => (
                        <tr key={bill.id} className="hover:bg-gray-50">
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(project.id);
                                setViewMode("SINGLE");
                              }}
                              className="font-bold text-blue-700 hover:underline text-left"
                            >
                              {project.name}
                            </button>
                            <div className="text-[10px] text-gray-500">
                              {project.code} • Cycle:{" "}
                              {project.terms.billCycleDays}d
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-gray-800">
                              {bill.forMonth}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {bill.billNumber || "No Bill #"}
                              {bill.poNumber ? ` • PO: ${bill.poNumber}` : ""}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-gray-700">
                              Sub: <strong>{bill.submittedAt || "—"}</strong>
                            </div>
                            <div className="text-gray-700">
                              Due: <strong>{bill.dueDate || "—"}</strong>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${derived.cls}`}
                            >
                              {derived.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-gray-800">
                            Tk {formatBDT(bill.expectedInflow)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700">
                            Tk {formatBDT(bill.receivedAmount)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-900">
                            Tk {formatBDT(derived.outstanding)}
                          </td>
                          {canEditFinance && (
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => openPaymentModal(bill, project)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700"
                              >
                                💰 Update / Pay
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          VIEW MODE 1: SINGLE PROJECT / EVENT / IMS GROUP DIVISION VIEW (DEFAULT)
         ======================================================================== */}
      {viewMode === "SINGLE" && (
        <>
          {!selectedProject || !activeStats ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
              <div className="text-base font-bold text-gray-800">
                No Items Available
              </div>
            </div>
          ) : selectedProject.kind === "COMPANY" ? (
            /* ==================================================================
               🏢 IMS GROUP INTERNAL OVERHEAD EXPENSES VIEW
               ================================================================== */
            <>
              {/* STEP 2 (COMPANY): SELECTED IMS GROUP DIVISION BANNER */}
              <div className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-rose-50 text-rose-800 border-rose-200">
                        🏢 IMS GROUP INTERNAL EXPENSE
                      </span>
                      <span className="text-xs font-mono font-bold text-gray-500">
                        {selectedProject.code}
                      </span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs font-semibold text-gray-600">
                        {selectedProject.companyName}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mt-1">
                      {selectedProject.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-gray-600">
                      <span>
                        Category:{" "}
                        <strong className="text-rose-800">
                          100% Internal Company Overhead (OPEX)
                        </strong>
                      </span>
                      <span>
                        Division Head:{" "}
                        <strong className="text-gray-900">
                          {selectedProject.headName}
                        </strong>
                      </span>
                      <span>
                        Director:{" "}
                        <strong className="text-gray-900">
                          {selectedProject.directorName}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Consolidated Group Net Profit Box */}
                  <div className="w-full md:w-96 bg-slate-900 text-white rounded-xl p-3.5">
                    <div className="text-[11px] font-bold text-slate-300 uppercase">
                      🏦 IMS Group Bottom-Line Impact (All-Time)
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1.5">
                      <span className="text-slate-300">
                        Projects + Events Profit:
                      </span>
                      <strong className="text-emerald-400 font-mono">
                        +Tk{" "}
                        {formatBDT(
                          consolidatedGroupStats.totalProjectsAllTimeProfit +
                            consolidatedGroupStats.totalEventsAllTimeProfit
                        )}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-slate-300">
                        Less Total Group Overhead:
                      </span>
                      <strong className="text-rose-400 font-mono">
                        −Tk{" "}
                        {formatBDT(
                          consolidatedGroupStats.totalCompanyAllTimeSpend
                        )}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1.5 pt-1.5 border-t border-slate-700">
                      <span className="font-bold text-white">
                        True Group Net Profit:
                      </span>
                      <strong
                        className={`font-mono text-sm ${
                          consolidatedGroupStats.trueGroupBottomLineAllTime >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {consolidatedGroupStats.trueGroupBottomLineAllTime >= 0
                          ? "+"
                          : ""}
                        Tk{" "}
                        {formatBDT(
                          consolidatedGroupStats.trueGroupBottomLineAllTime
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3 (COMPANY): 6 KPI CARDS FOR IMS GROUP EXPENSES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-rose-800 uppercase">
                    1. Division Overhead Spend
                  </div>
                  <div className="text-base font-bold text-rose-950 mt-1">
                    Tk {formatBDT(activeStats.totalSpend)}
                  </div>
                  <div className="text-[11px] text-rose-700 mt-1">
                    Across <strong>{activeStats.reqs.length}</strong>{" "}
                    Requisition(s)
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    2. Approved / Executed
                  </div>
                  <div className="text-base font-bold text-emerald-900 mt-1">
                    Tk {formatBDT(activeStats.executedSpend)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Confirmed overhead spend
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    3. Pending Approval
                  </div>
                  <div className="text-base font-bold text-amber-800 mt-1">
                    Tk {formatBDT(activeStats.pendingSpend)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    In approval pipeline
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    4. Monthly Avg Burn
                  </div>
                  <div className="text-base font-bold text-gray-900 mt-1">
                    Tk {formatBDT(activeStats.monthlyAvgSpend)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Average per active month
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    5. Share of Group OPEX
                  </div>
                  <div className="text-base font-bold text-gray-900 mt-1">
                    {consolidatedGroupStats.totalCompanyAllTimeSpend > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (activeStats.totalSpend /
                              consolidatedGroupStats.totalCompanyAllTimeSpend) *
                              100
                          )
                        )}%`
                      : "0%"}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Of Tk{" "}
                    {formatCompactBDT(
                      consolidatedGroupStats.totalCompanyAllTimeSpend
                    )}{" "}
                    total OPEX
                  </div>
                </div>

                <div
                  className={`border rounded-xl p-4 shadow-sm ${
                    consolidatedGroupStats.trueGroupBottomLineAllTime >= 0
                      ? "bg-emerald-50/80 border-emerald-300"
                      : "bg-red-50 border-red-300"
                  }`}
                >
                  <div className="text-[11px] font-bold text-gray-700 uppercase">
                    6. True Group Net P&L
                  </div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      consolidatedGroupStats.trueGroupBottomLineAllTime >= 0
                        ? "text-emerald-900"
                        : "text-red-900"
                    }`}
                  >
                    {consolidatedGroupStats.trueGroupBottomLineAllTime >= 0
                      ? "+"
                      : ""}
                    Tk{" "}
                    {formatBDT(
                      consolidatedGroupStats.trueGroupBottomLineAllTime
                    )}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    (Proj + Evt Profit) − Group OPEX
                  </div>
                </div>
              </div>

              {/* STEP 4 (COMPANY): TWO CLEAN TABLES FOR IMS GROUP EXPENSES */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* TABLE A: ALL REQUISITIONS OF THIS IMS GROUP DIVISION */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        📋 Internal Requisitions — {selectedProject.name} (
                        {activeStats.reqs.length})
                      </h3>
                      <p className="text-xs text-gray-500">
                        Click any requisition voucher to view or expand its expense line items.
                      </p>
                    </div>
                  </div>

                  {activeStats.reqs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500">
                      No requisitions recorded for{" "}
                      <strong>{selectedProject.name}</strong> in this period.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3">Voucher #</th>
                            <th className="py-2.5 px-3">Date / Month</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">
                              Amount (Tk)
                            </th>
                            <th className="py-2.5 px-3 text-center">Items</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {activeStats.reqs.map((r) => {
                            const isExpanded = expandedReqId === r.id;
                            return (
                              <React.Fragment key={r.id}>
                                <tr className="hover:bg-gray-50/80">
                                  <td className="py-3 px-3 font-bold text-blue-700">
                                    <Link
                                      href={`/requisitions/${r.id}`}
                                      className="hover:underline"
                                    >
                                      {r.number}
                                    </Link>
                                    <div className="text-[10px] font-normal text-gray-500">
                                      {r.makerName}
                                      {r.divisionName
                                        ? ` • ${r.divisionName}`
                                        : ""}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-gray-700">
                                    <div>{r.date}</div>
                                    <div className="font-mono text-[10px] text-gray-400">
                                      {r.forMonth}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-bold">
                                      {r.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-rose-900">
                                    Tk {formatBDT(r.total)}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedReqId(
                                          isExpanded ? null : r.id
                                        )
                                      }
                                      className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700"
                                    >
                                      {isExpanded
                                        ? "▲ Hide"
                                        : `▼ ${r.items?.length || 0}`}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && r.items && r.items.length > 0 && (
                                  <tr className="bg-slate-50">
                                    <td colSpan={5} className="p-3">
                                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-[11px]">
                                          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                            <tr>
                                              <th className="py-1.5 px-2.5 text-left">
                                                SL
                                              </th>
                                              <th className="py-1.5 px-2.5 text-left">
                                                Particulars
                                              </th>
                                              <th className="py-1.5 px-2.5 text-left">
                                                Cost Head
                                              </th>
                                              <th className="py-1.5 px-2.5 text-right">
                                                Amount (Tk)
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {r.items.map((it) => (
                                              <tr key={it.id}>
                                                <td className="py-1.5 px-2.5 text-gray-500">
                                                  {it.sl}
                                                </td>
                                                <td className="py-1.5 px-2.5 font-medium text-gray-800">
                                                  {it.particulars}
                                                </td>
                                                <td className="py-1.5 px-2.5 text-gray-600">
                                                  {it.costHead}
                                                </td>
                                                <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-gray-900">
                                                  {formatBDT(it.amount)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                          <tr>
                            <td colSpan={3} className="py-2.5 px-3">
                              Total Overhead ({activeStats.reqs.length}{" "}
                              Requisition
                              {activeStats.reqs.length === 1 ? "" : "s"})
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-900">
                              Tk {formatBDT(activeStats.totalSpend)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* TABLE B: OVERHEAD EXPENSE BREAKDOWN BY COST HEAD / DIVISION */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        🧾 Expense Breakdown by Cost Head & Division
                      </h3>
                      <p className="text-xs text-gray-500">
                        Summary of where IMS Group internal overhead is spent.
                      </p>
                    </div>
                  </div>

                  {costHeadPieData.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500">
                      No expense breakdown available for this selection yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3">
                              Expense Head / Particular
                            </th>
                            <th className="py-2.5 px-3 text-right">
                              Total Spend (Tk)
                            </th>
                            <th className="py-2.5 px-3 text-right">
                              % of Selection
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {costHeadPieData.map((item, idx) => {
                            const pct =
                              activeStats.totalSpend > 0
                                ? (
                                    (item.value / activeStats.totalSpend) *
                                    100
                                  ).toFixed(1)
                                : "0.0";
                            return (
                              <tr key={item.name} className="hover:bg-gray-50">
                                <td className="py-2.5 px-3 font-medium text-gray-800 flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        PIE_COLORS[idx % PIE_COLORS.length],
                                    }}
                                  />
                                  {item.name}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                                  Tk {formatBDT(item.value)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                                  {pct}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                          <tr>
                            <td className="py-2.5 px-3">Total Overhead</td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-900">
                              Tk {formatBDT(activeStats.totalSpend)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              100%
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ==================================================================
               📁 PROJECT OR 🎪 EVENT VIEW
               ================================================================== */
            <>
              {/* STEP 2: SELECTED PROJECT / EVENT BANNER & COLLECTION PROGRESS */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          selectedProject.kind === "EVENT"
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}
                      >
                        {selectedProject.kind === "EVENT"
                          ? "🎪 EVENT"
                          : "📁 PROJECT"}
                      </span>
                      <span className="text-xs font-mono font-bold text-gray-500">
                        {selectedProject.code}
                      </span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs font-semibold text-gray-600">
                        {selectedProject.companyName}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mt-1">
                      {selectedProject.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-gray-600">
                      <span>
                        Billing Model:{" "}
                        <strong className="text-gray-900">
                          {BILLING_MODEL_LABELS[
                            selectedProject.terms.billingProfile
                          ] || selectedProject.terms.billingProfile}
                        </strong>
                      </span>
                      <span>
                        Fee/Markup:{" "}
                        <strong className="text-gray-900">
                          {(selectedProject.terms.feeRate * 100).toFixed(1)}%
                        </strong>
                      </span>
                      <span>
                        VAT:{" "}
                        <strong className="text-gray-900">
                          {(selectedProject.terms.vatRate * 100).toFixed(1)}%
                        </strong>
                      </span>
                      <span>
                        AIT:{" "}
                        <strong className="text-gray-900">
                          {(selectedProject.terms.aitRate * 100).toFixed(1)}%
                        </strong>
                      </span>
                      <span>
                        Cycle:{" "}
                        <strong className="text-gray-900">
                          {selectedProject.terms.billCycleDays} Days
                        </strong>
                      </span>
                      <span>
                        Head:{" "}
                        <strong className="text-gray-900">
                          {selectedProject.headName}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Collection Progress Box */}
                  <div className="w-full md:w-80 bg-gray-50 border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-gray-700">
                        Client Payment Collection
                      </span>
                      <span className="font-bold text-emerald-700">
                        {activeStats.collectionPercent}% Collected
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all"
                        style={{ width: `${activeStats.collectionPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1.5">
                      <span>
                        Received:{" "}
                        <strong className="text-emerald-700">
                          Tk {formatBDT(activeStats.receivedAmount)}
                        </strong>
                      </span>
                      <span>
                        Due:{" "}
                        <strong className="text-amber-700">
                          Tk {formatBDT(activeStats.remainingDue)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3: 6 CLEAN KPI CARDS FOR THIS SELECTED PROJECT / EVENT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    1. Total Requisitions Spend
                  </div>
                  <div className="text-base font-bold text-gray-900 mt-1">
                    Tk {formatBDT(activeStats.totalSpend)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Across <strong>{activeStats.reqs.length}</strong>{" "}
                    Requisition(s)
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Billable: {formatBDT(activeStats.billableSpend)} • IMS:{" "}
                    {formatBDT(activeStats.imsSpend)}
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-blue-800 uppercase">
                    2. Client Bill (With 15% VAT)
                  </div>
                  <div className="text-base font-bold text-blue-950 mt-1">
                    Tk {formatBDT(activeStats.billedWithVat)}
                  </div>
                  <div className="text-[11px] text-blue-700 mt-1">
                    Ex-VAT Bill: Tk {formatBDT(activeStats.billedExVat)}
                  </div>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-indigo-800 uppercase">
                    3. Expected Inflow (-AIT)
                  </div>
                  <div className="text-base font-bold text-indigo-950 mt-1">
                    Tk {formatBDT(activeStats.expectedInflow)}
                  </div>
                  <div className="text-[11px] text-indigo-700 mt-1">
                    AIT Deducted: Tk {formatBDT(activeStats.calc.aitDeducted)}
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">
                    4. Payment Received
                  </div>
                  <div className="text-base font-bold text-emerald-900 mt-1">
                    Tk {formatBDT(activeStats.receivedAmount)}
                  </div>
                  <div className="text-[11px] text-amber-800 font-semibold mt-1">
                    Remaining Due: Tk {formatBDT(activeStats.remainingDue)} (
                    {activeStats.bills.length} Pay)
                  </div>
                </div>

                <div
                  className={`border rounded-xl p-4 shadow-sm ${
                    activeStats.accruedProfit >= 0
                      ? "bg-emerald-50/80 border-emerald-300"
                      : "bg-red-50 border-red-300"
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold uppercase ${
                      activeStats.accruedProfit >= 0
                        ? "text-emerald-800"
                        : "text-red-800"
                    }`}
                  >
                    5. Accrued Profit / Loss
                  </div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      activeStats.accruedProfit >= 0
                        ? "text-emerald-900"
                        : "text-red-900"
                    }`}
                  >
                    {activeStats.accruedProfit >= 0 ? "+" : ""}Tk{" "}
                    {formatBDT(activeStats.accruedProfit)}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    Expected Inflow − Total Cost (
                    {activeStats.calc.netMarginPct.toFixed(1)}%)
                  </div>
                </div>

                <div
                  className={`border rounded-xl p-4 shadow-sm ${
                    activeStats.realizedProfit >= 0
                      ? "bg-teal-50/80 border-teal-300"
                      : "bg-amber-50/70 border-amber-300"
                  }`}
                >
                  <div className="text-[11px] font-bold text-gray-700 uppercase">
                    6. Realized Cash P&L
                  </div>
                  <div
                    className={`text-base font-bold mt-1 ${
                      activeStats.realizedProfit >= 0
                        ? "text-teal-900"
                        : "text-amber-900"
                    }`}
                  >
                    {activeStats.realizedProfit >= 0 ? "+" : ""}Tk{" "}
                    {formatBDT(activeStats.realizedProfit)}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    Cash Received − Total Cost
                  </div>
                </div>
              </div>

              {/* STEP 4: TWO CLEAN TABLES FOR THE SELECTED PROJECT / EVENT */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* TABLE A: ALL REQUISITIONS OF THIS PROJECT / EVENT */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        📋 Requisitions of {selectedProject.name} (
                        {activeStats.reqs.length})
                      </h3>
                      <p className="text-xs text-gray-500">
                        Every requisition adds to total project spend. Click a row to view its line items.
                      </p>
                    </div>
                  </div>

                  {activeStats.reqs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500">
                      No requisitions created for{" "}
                      <strong>{selectedProject.name}</strong> in this period.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3">Voucher #</th>
                            <th className="py-2.5 px-3">Date / Month</th>
                            <th className="py-2.5 px-3 text-right">Billable</th>
                            <th className="py-2.5 px-3 text-right">IMS Inv.</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                            <th className="py-2.5 px-3 text-center">Items</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {activeStats.reqs.map((r) => {
                            const isExpanded = expandedReqId === r.id;
                            return (
                              <React.Fragment key={r.id}>
                                <tr className="hover:bg-gray-50/80">
                                  <td className="py-3 px-3 font-bold text-blue-700">
                                    <Link
                                      href={`/requisitions/${r.id}`}
                                      className="hover:underline"
                                    >
                                      {r.number}
                                    </Link>
                                    <div className="text-[10px] font-normal text-gray-500">
                                      {r.makerName} • {r.status}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-gray-700">
                                    <div>{r.date}</div>
                                    <div className="font-mono text-[10px] text-gray-400">
                                      {r.forMonth}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono text-gray-800">
                                    {formatBDT(r.billableCost)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono text-amber-800">
                                    {formatBDT(r.imsInvestment)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                                    {formatBDT(r.total)}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedReqId(
                                          isExpanded ? null : r.id
                                        )
                                      }
                                      className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700"
                                    >
                                      {isExpanded
                                        ? "▲ Hide"
                                        : `▼ ${r.items?.length || 0}`}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && r.items && r.items.length > 0 && (
                                  <tr className="bg-slate-50">
                                    <td colSpan={6} className="p-3">
                                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-[11px]">
                                          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                            <tr>
                                              <th className="py-1.5 px-2.5 text-left">
                                                SL
                                              </th>
                                              <th className="py-1.5 px-2.5 text-left">
                                                Particulars
                                              </th>
                                              <th className="py-1.5 px-2.5 text-left">
                                                Cost Head
                                              </th>
                                              <th className="py-1.5 px-2.5 text-center">
                                                Tag
                                              </th>
                                              <th className="py-1.5 px-2.5 text-right">
                                                Amount (Tk)
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {r.items.map((it) => (
                                              <tr key={it.id}>
                                                <td className="py-1.5 px-2.5 text-gray-500">
                                                  {it.sl}
                                                </td>
                                                <td className="py-1.5 px-2.5 font-medium text-gray-800">
                                                  {it.particulars}
                                                </td>
                                                <td className="py-1.5 px-2.5 text-gray-600">
                                                  {it.costHead}
                                                </td>
                                                <td className="py-1.5 px-2.5 text-center">
                                                  <span
                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                      it.costTag ===
                                                      "IMS_INVESTMENT"
                                                        ? "bg-amber-100 text-amber-800"
                                                        : "bg-blue-50 text-blue-700"
                                                    }`}
                                                  >
                                                    {it.costTag}
                                                  </span>
                                                </td>
                                                <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-gray-900">
                                                  {formatBDT(it.amount)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                          <tr>
                            <td colSpan={2} className="py-2.5 px-3">
                              Total ({activeStats.reqs.length} Requisition
                              {activeStats.reqs.length === 1 ? "" : "s"})
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              Tk {formatBDT(activeStats.billableSpend)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-900">
                              Tk {formatBDT(activeStats.imsSpend)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              Tk {formatBDT(activeStats.totalSpend)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* TABLE B: PARTIAL & FULL PAYMENT INSTALLMENTS FOR THIS PROJECT / EVENT */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        💵 Partial & Full Payments Received (
                        {activeStats.bills.length})
                      </h3>
                      <p className="text-xs text-gray-500">
                        Derived maturity status with ±10 BDT tolerance. Each installment reduces Remaining Due.
                      </p>
                    </div>
                    {canEditFinance && (
                      <button
                        type="button"
                        onClick={() => openPaymentModal()}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 shrink-0"
                      >
                        + Add Payment
                      </button>
                    )}
                  </div>

                  {activeStats.bills.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500">
                      No partial or full payments recorded for{" "}
                      <strong>{selectedProject.name}</strong> yet.
                      {canEditFinance && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => openPaymentModal()}
                            className="text-emerald-700 font-bold underline"
                          >
                            + Record First Payment / Installment
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-3"># / Period</th>
                            <th className="py-2.5 px-3">Invoice / Ref</th>
                            <th className="py-2.5 px-3">
                              Derived Status & Due
                            </th>
                            <th className="py-2.5 px-3 text-right">
                              Received (Tk)
                            </th>
                            {canEditFinance && (
                              <th className="py-2.5 px-3 text-right">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {activeStats.bills.map((b, idx) => {
                            const derived = deriveBillStatus(b);
                            return (
                              <tr key={b.id} className="hover:bg-gray-50/80">
                                <td className="py-3 px-3">
                                  <div className="font-bold text-gray-800">
                                    #{activeStats.bills.length - idx}
                                  </div>
                                  <div className="font-mono text-[10px] text-gray-500">
                                    {b.forMonth}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-semibold text-gray-800">
                                    {b.billNumber || "—"}
                                  </div>
                                  {b.notes && (
                                    <div className="text-[10px] text-gray-500 truncate max-w-[160px]">
                                      {b.notes}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${derived.cls}`}
                                  >
                                    {derived.label}
                                  </span>
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                    {b.receivedAt
                                      ? `Paid: ${b.receivedAt}`
                                      : b.dueDate
                                      ? `Due: ${b.dueDate}`
                                      : b.submittedAt || "—"}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800">
                                  Tk {formatBDT(b.receivedAmount)}
                                </td>
                                {canEditFinance && (
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => openPaymentModal(b)}
                                      className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 mr-1"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBill(b.id)}
                                      className="px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-[11px] font-semibold text-red-700"
                                    >
                                      🗑️
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900">
                          <tr>
                            <td colSpan={3} className="py-2.5 px-3">
                              Total Received ({activeStats.bills.length}{" "}
                              Installment
                              {activeStats.bills.length === 1 ? "" : "s"})
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                              Tk {formatBDT(activeStats.receivedAmount)}
                            </td>
                            {canEditFinance && (
                              <td className="py-2.5 px-3 text-right text-[11px] text-amber-800">
                                Due: Tk {formatBDT(activeStats.remainingDue)}
                              </td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* STEP 5 (SHARED): COMPACT VISUAL DATA ANALYSIS CHARTS BELOW THE PAGE */}
          {selectedProject && activeStats && (
            <div className="pt-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                📊 Visual Data Analysis — {selectedProject.name}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Compact Chart 1 */}
                <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                  <div className="mb-2">
                    <h4 className="text-xs font-bold text-gray-900">
                      {selectedProject.kind === "COMPANY"
                        ? "📈 Monthly Overhead Spend Trend"
                        : "📈 Spend vs. Inflow & Profit"}
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      {selectedProject.kind === "COMPANY"
                        ? "Monthly internal requisition spend"
                        : "Monthly Spend, Expected Inflow, Received & Profit"}
                    </p>
                  </div>

                  {monthlyChartData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                      No monthly data yet.
                    </div>
                  ) : (
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyChartData}
                          margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                          />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            width={40}
                            tickFormatter={(v) =>
                              v >= 100000
                                ? `${(v / 100000).toFixed(1)}L`
                                : v >= 1000
                                ? `${(v / 1000).toFixed(0)}k`
                                : String(v)
                            }
                          />
                          <Tooltip
                            formatter={(val: any) =>
                              `Tk ${formatBDT(Number(val || 0))}`
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar
                            dataKey="totalCost"
                            name={
                              selectedProject.kind === "COMPANY"
                                ? "Overhead Spend"
                                : "Cost"
                            }
                            fill={
                              selectedProject.kind === "COMPANY"
                                ? "#be123c"
                                : "#4b5563"
                            }
                            radius={[3, 3, 0, 0]}
                          />
                          {selectedProject.kind !== "COMPANY" && (
                            <>
                              <Bar
                                dataKey="expectedInflow"
                                name="Inflow (-AIT)"
                                fill="#4f46e5"
                                radius={[3, 3, 0, 0]}
                              />
                              <Bar
                                dataKey="receivedAmount"
                                name="Received"
                                fill="#059669"
                                radius={[3, 3, 0, 0]}
                              />
                              <Bar
                                dataKey="accruedProfit"
                                name="Profit"
                                fill="#10b981"
                                radius={[3, 3, 0, 0]}
                              />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Compact Chart 2 */}
                <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                  <div className="mb-2">
                    <h4 className="text-xs font-bold text-gray-900">
                      🍩 Cost Head Breakdown
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Requisition spend by cost head
                    </p>
                  </div>

                  {costHeadPieData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                      No line items yet.
                    </div>
                  ) : (
                    <div className="h-40 w-full flex items-center gap-2">
                      <div className="h-36 w-1/2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={costHeadPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={25}
                              outerRadius={48}
                              paddingAngle={2}
                            >
                              {costHeadPieData.map((_, idx) => (
                                <Cell
                                  key={idx}
                                  fill={PIE_COLORS[idx % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(val: any) =>
                                `Tk ${formatBDT(Number(val || 0))}`
                              }
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="w-1/2 space-y-1 max-h-36 overflow-y-auto pr-1">
                        {costHeadPieData.map((d, idx) => (
                          <div
                            key={d.name}
                            className="flex items-center justify-between text-[10px]"
                          >
                            <div className="flex items-center gap-1 truncate">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    PIE_COLORS[idx % PIE_COLORS.length],
                                }}
                              />
                              <span className="text-gray-700 truncate">
                                {d.name}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-gray-900 ml-1">
                              {formatBDT(d.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Compact Chart 3 */}
                <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                  <div className="mb-2">
                    <h4 className="text-xs font-bold text-gray-900">
                      📊 Requisitions Spend ({reqBarData.length})
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Individual requisition amounts
                    </p>
                  </div>

                  {reqBarData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                      No requisitions yet.
                    </div>
                  ) : (
                    <div className="h-40 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={reqBarData}
                          margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e5e7eb"
                          />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            width={40}
                            tickFormatter={(v) =>
                              v >= 100000
                                ? `${(v / 100000).toFixed(1)}L`
                                : v >= 1000
                                ? `${(v / 1000).toFixed(0)}k`
                                : String(v)
                            }
                          />
                          <Tooltip
                            formatter={(val: any) =>
                              `Tk ${formatBDT(Number(val || 0))}`
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {selectedProject.kind === "COMPANY" ? (
                            <Bar
                              dataKey="Total"
                              name="Overhead Amount"
                              fill="#be123c"
                              radius={[3, 3, 0, 0]}
                            />
                          ) : (
                            <>
                              <Bar
                                dataKey="Billable"
                                name="Billable"
                                stackId="a"
                                fill="#2563eb"
                              />
                              <Bar
                                dataKey="IMS_Investment"
                                name="IMS Inv."
                                stackId="a"
                                fill="#d97706"
                                radius={[3, 3, 0, 0]}
                              />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: RECORD / UPDATE PARTIAL OR FULL PAYMENT */}
      {modalOpen && (modalProject || selectedProject) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-200 my-8">
            {(() => {
              const proj = (modalProject || selectedProject)!;
              return (
                <>
                  <div className="flex items-start justify-between border-b border-gray-200 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">
                        {editingBillId
                          ? "✏️ Edit Payment / Client Bill Record"
                          : "💰 Record Partial or Full Client Payment"}
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {proj.kind === "EVENT" ? "🎪 Event: " : "📁 Project: "}
                        <strong>{proj.name}</strong> ({proj.code}) • Cycle:{" "}
                        <strong>{proj.terms.billCycleDays} Days</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="text-gray-400 hover:text-gray-700 text-lg font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <form
                    onSubmit={handleSaveBill}
                    className="mt-4 space-y-4 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          Service Month
                        </label>
                        <input
                          type="text"
                          required
                          value={formMonth}
                          onChange={(e) => setFormMonth(e.target.value)}
                          placeholder="e.g. 2026-10"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          Payment Status
                        </label>
                        <select
                          value={formStatus}
                          onChange={(e) => setFormStatus(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-semibold"
                        >
                          <option value="PARTIAL_PAID">
                            Partial Payment
                          </option>
                          <option value="PAID">Full / Final Payment</option>
                          <option value="SUBMITTED">
                            Bill Submitted (Unpaid)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          Invoice / Bill #
                        </label>
                        <input
                          type="text"
                          value={formBillNo}
                          onChange={(e) => setFormBillNo(e.target.value)}
                          placeholder="e.g. INV-2026-042"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          PO Number
                        </label>
                        <input
                          type="text"
                          value={formPoNo}
                          onChange={(e) => setFormPoNo(e.target.value)}
                          placeholder="e.g. PO-8821"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </div>
                    </div>

                    {/* Bill Submission Date & Auto-Calculated Due Date (§4.4) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-blue-50/40 border border-blue-100 rounded-xl p-3">
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          Bill Submitted Date
                        </label>
                        <input
                          type="date"
                          value={formSubmittedAt}
                          onChange={(e) => {
                            const sub = e.target.value;
                            setFormSubmittedAt(sub);
                            if (sub) {
                              setFormDueDate(
                                computeDueDateStr(
                                  sub,
                                  proj.terms.billCycleDays
                                )
                              );
                            }
                          }}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          Maturity / Due Date (+{proj.terms.billCycleDays}d
                          auto)
                        </label>
                        <input
                          type="date"
                          value={formDueDate}
                          onChange={(e) => setFormDueDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-3">
                      <div className="font-bold text-gray-800">
                        1. Requisition Cost & Expected Client Bill Snapshot (Tk)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-600 mb-1">
                            Billable Requisition Cost (Tk)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formBillableCost}
                            onChange={(e) =>
                              handleAutoRecalculate(e.target.value, formImsInv)
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1">
                            IMS Own Investment Cost (Tk)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formImsInv}
                            onChange={(e) =>
                              handleAutoRecalculate(
                                formBillableCost,
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <label className="block text-blue-800 mb-1">
                            Client Bill Ex-VAT (Tk)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formBillExVat}
                            onChange={(e) => setFormBillExVat(e.target.value)}
                            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-blue-800 mb-1">
                            15% VAT Amount (Tk)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formVatAmt}
                            onChange={(e) => setFormVatAmt(e.target.value)}
                            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-blue-800 mb-1">
                            AIT Deducted by Client (Tk)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formAitAmt}
                            onChange={(e) => setFormAitAmt(e.target.value)}
                            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-mono"
                          />
                        </div>
                      </div>
                      <div className="text-[11px] text-blue-900 pt-1">
                        Bill With VAT:{" "}
                        <strong>Tk {formatBDT(liveBillWithVat)}</strong> •
                        Expected Net Inflow (Bill Ex-VAT − AIT):{" "}
                        <strong>Tk {formatBDT(liveExpectedInflow)}</strong>
                      </div>
                    </div>

                    {/* Partial / Full Payment Amount */}
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-950">
                          2. Payment Received in This Installment
                        </span>
                        {formReceivedAmt !== "" && (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              Math.abs(liveDeviation) <= PAYMENT_TOLERANCE_BDT
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            Deviation: {liveDeviation >= 0 ? "+" : ""}Tk{" "}
                            {formatBDT(liveDeviation)}
                            {Math.abs(liveDeviation) <= PAYMENT_TOLERANCE_BDT
                              ? " (Within ±10 BDT Tolerance → Fully Paid)"
                              : ""}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-emerald-900 mb-1">
                            Received Payment Amount (Tk) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={formReceivedAmt}
                            onChange={(e) => setFormReceivedAmt(e.target.value)}
                            placeholder="Enter amount received (0 if only submitting bill)"
                            className="w-full rounded-lg border-2 border-emerald-500 bg-white px-3 py-2 font-mono font-bold text-sm text-emerald-950"
                          />
                        </div>
                        <div>
                          <label className="block text-emerald-900 font-semibold mb-1">
                            Payment Received Date
                          </label>
                          <input
                            type="date"
                            value={formReceivedAt}
                            onChange={(e) => setFormReceivedAt(e.target.value)}
                            className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-gray-700 font-semibold mb-1">
                          Installment Description / Bank Reference / Deviation Reason
                        </label>
                        <input
                          type="text"
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          placeholder="e.g. 1st Partial Payment (40% Advance via Bank Transfer)"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 rounded-lg bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Record"}
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
