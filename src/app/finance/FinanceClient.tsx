"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateProfitSummary } from "@/lib/profitEngine";
import {
  PAYMENT_TOLERANCE_BDT,
  buildMatrixForList,
  buildMonthlyChartSeries,
  computeCustomBillPreview,
  computeProjectPeriodMetrics,
  deriveBillStatus,
} from "@/lib/financeMetrics";
import {
  BILLING_MODEL_LABELS,
  ClientBillItem,
  MONTH_NAMES,
  PIE_COLORS,
  ProjectFinanceItem,
  RequisitionSummaryItem,
  formatBDT,
  formatCompactBDT,
} from "./components/types";
import PaymentBillModal from "./components/PaymentBillModal";
import {
  ForecastOverrideModal,
  MonthCloseModal,
} from "./components/MonthCloseAndForecastModals";
import ReceivablesAgeingView from "./components/ReceivablesAgeingView";
import { useToast } from "@/components/ToastProvider";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function FinanceClient({
  projects,
  canEditFinance,
  canDisburse = false,
  canCloseMonth = false,
  isFullReportAccess = false,
}: {
  projects: ProjectFinanceItem[];
  canEditFinance: boolean;
  canDisburse?: boolean;
  canCloseMonth?: boolean;
  isFullReportAccess?: boolean;
}) {
  const router = useRouter();
  const { toast, confirmDialog } = useToast();

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
        approvedReqCount: number;
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
            approvedReqCount: 0,
          };
        }
        byMonth[m.forMonth].billableCost += m.billableCost;
        byMonth[m.forMonth].imsInvestment += m.imsInvestment;
        byMonth[m.forMonth].executedBillable += m.executedBillable;
        byMonth[m.forMonth].executedImsInv += m.executedImsInv;
        byMonth[m.forMonth].reqCount += m.reqCount;
        byMonth[m.forMonth].approvedReqCount =
          (byMonth[m.forMonth].approvedReqCount || 0) + (m.approvedReqCount || 0);
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
  >(() => {
    if (permanentProjects.length > 0) return "PERMANENT";
    if (eventProjects.length > 0) return "EVENT";
    if (companyDivisions.length > 0) return "COMPANY";
    return "PERMANENT";
  });
  const [viewMode, setViewMode] = useState<
    | "SUMMARY_MATRIX"
    | "NEW_ENTRY"
    | "AGEING"
    | "DISBURSE"
    | "MONTH_CLOSE"
    | "GROUP_OVERVIEW"
    | "SINGLE"
  >("SUMMARY_MATRIX");

  // Client Bill Entry state
  const [inlineBillNo, setInlineBillNo] = useState("");
  const [inlinePoNo, setInlinePoNo] = useState("");
  const [inlineSubmittedOn, setInlineSubmittedOn] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [inlineServiceMonth, setInlineServiceMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [inlineIsOpeningBalance, setInlineIsOpeningBalance] = useState(false);
  const [inlineOpeningBillExVat, setInlineOpeningBillExVat] = useState("");
  const [inlineBillableCostStr, setInlineBillableCostStr] = useState<string>("");
  const [inlineBillExVatOverrideStr, setInlineBillExVatOverrideStr] =
    useState<string>("");

  // Receivables Quick-Pay & Timeline state
  const [quickPayBillId, setQuickPayBillId] = useState<string>("");
  const [quickPayDate, setQuickPayDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [quickPayAmountStr, setQuickPayAmountStr] = useState<string>("");
  const [quickPayDeviationReason, setQuickPayDeviationReason] =
    useState<string>("");
  const [selectedTimelineBillId, setSelectedTimelineBillId] =
    useState<string>("");

  // Disburse Approved Funds screen state
  const [selectedDisburseReqId, setSelectedDisburseReqId] =
    useState<string>("");
  const [disburseLineAmounts, setDisburseLineAmounts] = useState<
    Record<string, string>
  >({});
  const [disbursePaymentDate, setDisbursePaymentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [disbursePaidBy, setDisbursePaidBy] = useState<string>("BANK");
  const [disburseBankRef, setDisburseBankRef] = useState<string>("");
  const [disbursePinOrPassword, setDisbursePinOrPassword] = useState<string>("");

  // All-Projects Month Close Checklist state
  const [allCloseMonthTarget, setAllCloseMonthTarget] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  // Group Overview filter state
  const [groupKamFilter, setGroupKamFilter] = useState<string>("ALL");
  const [showSingleCharts, setShowSingleCharts] = useState<boolean>(false);
  const [singleDetailTab, setSingleDetailTab] = useState<
    "REQUISITIONS" | "PAYMENTS"
  >("REQUISITIONS");
  const [companyDetailTab, setCompanyDetailTab] = useState<
    "REQUISITIONS" | "COST_HEADS"
  >("REQUISITIONS");

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
  >("QUARTERLY");

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
  const [formIsOpeningBalance, setFormIsOpeningBalance] = useState(false);
  const [saving, setSaving] = useState(false);

  // Month Close / Reopen Modal State (Priority 1B)
  const [closeMonthModalOpen, setCloseMonthModalOpen] = useState(false);
  const [closeMonthTarget, setCloseMonthTarget] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [closeMonthMode, setCloseMonthMode] = useState<"CLOSE" | "REOPEN">(
    "CLOSE"
  );
  const [closeMonthReason, setCloseMonthReason] = useState("");

  // Manual Forecast Override Modal State (Priority 1C)
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [forecastTargetProject, setForecastTargetProject] =
    useState<ProjectFinanceItem | null>(null);
  const [forecastTargetMonth, setForecastTargetMonth] = useState("");
  const [forecastAmountStr, setForecastAmountStr] = useState("");
  const [forecastNoteStr, setForecastNoteStr] = useState("");

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

  // Filtered Requisitions & Payments for the selected project/event/division and month (unified engine)
  const activeStats = useMemo(() => {
    if (!selectedProject) return null;
    return computeProjectPeriodMetrics({
      terms: selectedProject.terms,
      requisitions: selectedProject.requisitionsList,
      bills: selectedProject.bills,
      selectedMonth,
    });
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
        : ageingFilter === "NOT_YET_DUE"
        ? allBillRows.filter(
            (r) =>
              r.derived.code !== "PAID" &&
              (r.derived.ageingBucket === "NOT_YET_DUE" ||
                r.derived.ageingBucket === "DUE_SOON")
          )
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

  // 1. Monthly Chart Data for Selected Project/Event/Division (Approved/Executed spend only, reconciled with ClientBills)
  const monthlyChartData = useMemo(() => {
    if (!selectedProject) return [];
    return buildMonthlyChartSeries({
      requisitions: selectedProject.requisitionsList,
      bills: selectedProject.bills,
      terms: selectedProject.terms,
      kind: selectedProject.kind,
    });
  }, [selectedProject]);

  // 2. Cost Head Breakdown Pie Data for Selected Project/Event/Division (Approved/Executed spend only)
  const costHeadPieData = useMemo(() => {
    if (!activeStats) return [];
    const map: Record<string, number> = {};
    for (const r of activeStats.approvedReqs) {
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

  // 3. Requisition-by-Requisition Bar Data (Approved/Executed spend only)
  const reqBarData = useMemo(() => {
    if (!activeStats) return [];
    return activeStats.approvedReqs
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
      setFormIsOpeningBalance(Boolean(existingBill.isOpeningBalance));
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
      setFormIsOpeningBalance(false);

      const monthRow =
        m !== "EVENT-TOTAL"
          ? proj.monthlyBreakdown.find((mb) => mb.forMonth === m)
          : undefined;
      const bSpend = monthRow
        ? monthRow.billableCost
        : selectedMonth !== "ALL" && proj.id === selectedProject?.id && activeStats
        ? activeStats.billableSpend
        : proj.kind === "EVENT"
        ? proj.totalBillableReq
        : 0;
      const iSpend = monthRow
        ? monthRow.imsInvestment
        : selectedMonth !== "ALL" && proj.id === selectedProject?.id && activeStats
        ? activeStats.imsSpend
        : proj.kind === "EVENT"
        ? proj.totalImsInvReq
        : 0;
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
          isOpeningBalance: formIsOpeningBalance,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save payment record");
        return;
      }
      toast.success("Payment record saved.");
      setModalOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleMonthCloseOrReopen(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject || selectedProject.id === "ALL_COMPANY") return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType:
            closeMonthMode === "CLOSE" ? "CLOSE_MONTH" : "REOPEN_MONTH",
          projectId: selectedProject.id,
          forMonth: closeMonthTarget,
          noBillReason:
            closeMonthMode === "CLOSE" ? closeMonthReason : undefined,
          reason: closeMonthMode === "REOPEN" ? closeMonthReason : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to update month close status");
        return;
      }
      toast.success(
        closeMonthMode === "CLOSE"
          ? `Month ${closeMonthTarget} marked as closed.`
          : `Month ${closeMonthTarget} reopened.`
      );
      setCloseMonthModalOpen(false);
      setCloseMonthReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveManualForecast(clearOverride = false) {
    if (!forecastTargetProject || !forecastTargetMonth) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "SET_FORECAST",
          projectId: forecastTargetProject.id,
          forMonth: forecastTargetMonth,
          clearOverride,
          manualNetProfit: clearOverride ? 0 : Number(forecastAmountStr || 0),
          manualNote: forecastNoteStr,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save forecast override");
        return;
      }
      toast.success(
        clearOverride
          ? "Forecast override cleared."
          : "Manual forecast override saved."
      );
      setForecastModalOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBill(id: string) {
    const ok = await confirmDialog({
      title: "Delete Payment / Bill Record",
      message: "Delete this payment / bill record? This action cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/finance/bills?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Payment / bill record deleted.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Failed to delete payment record.");
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

  // Derived helper for all requisitions waiting for disbursement
  const disburseWaitingReqs = useMemo(() => {
    const list: Array<{
      project: ProjectFinanceItem;
      req: RequisitionSummaryItem;
    }> = [];
    for (const p of currentList) {
      if (p.id === "ALL_COMPANY") continue;
      for (const r of p.requisitionsList) {
        if (
          r.status === "APPROVED" ||
          r.status === "FORWARDED" ||
          r.status === "PARTIAL_PAID"
        ) {
          list.push({ project: p, req: r });
        }
      }
    }
    return list;
  }, [currentList]);

  // Approval Pipeline counts for the right-side summary card
  const approvalPipelineCounts = useMemo(() => {
    let groupHeadCount = 0;
    let deptHeadCount = 0;
    let financeCount = 0;
    let mdCount = 0;
    let readyDisburseCount = 0;

    for (const p of currentList) {
      if (p.id === "ALL_COMPANY") continue;
      for (const r of p.requisitionsList) {
        if (r.status === "PENDING_HEAD" || r.status === "SUBMITTED") groupHeadCount++;
        else if (r.status === "PENDING_CHECKER") deptHeadCount++;
        else if (r.status === "PENDING_ACCOUNTS") financeCount++;
        else if (r.status === "PENDING_DIRECTOR" || r.status === "PENDING_MD") mdCount++;
        else if (r.status === "APPROVED" || r.status === "FORWARDED" || r.status === "PARTIAL_PAID") readyDisburseCount++;
      }
    }
    return {
      groupHeadCount,
      deptHeadCount,
      financeCount,
      mdCount,
      readyDisburseCount,
      totalPending: groupHeadCount + deptHeadCount + financeCount + mdCount,
    };
  }, [currentList]);

  // Projects ranked by profit for the share-of-total progress bars
  const rankedProjectsByProfit = useMemo(() => {
    return managementMatrix.rows
      .slice()
      .filter((r) => r.project.id !== "ALL_COMPANY")
      .sort((a, b) => b.fullYearTotal - a.fullYearTotal);
  }, [managementMatrix]);

  const maxProjectProfit = useMemo(() => {
    const max = Math.max(...rankedProjectsByProfit.map((r) => r.fullYearTotal), 1);
    return max > 0 ? max : 1;
  }, [rankedProjectsByProfit]);

  // Auto-populate editable Billable Cost when selectedProject or inlineServiceMonth changes
  const monthRequisitionBillable = useMemo(() => {
    if (!selectedProject) return 0;
    const monthRow = selectedProject.monthlyBreakdown.find(
      (m) => m.forMonth === inlineServiceMonth
    );
    if (monthRow) return monthRow.billableCost;
    return selectedProject.totalBillableReq || 0;
  }, [selectedProject, inlineServiceMonth]);

  const monthRequisitionIms = useMemo(() => {
    if (!selectedProject) return 0;
    const monthRow = selectedProject.monthlyBreakdown.find(
      (m) => m.forMonth === inlineServiceMonth
    );
    if (monthRow) return monthRow.imsInvestment;
    return selectedProject.totalImsInvReq || 0;
  }, [selectedProject, inlineServiceMonth]);

  useEffect(() => {
    setInlineBillableCostStr(String(monthRequisitionBillable || 0));
    setInlineBillExVatOverrideStr("");
  }, [selectedProject?.id, inlineServiceMonth, monthRequisitionBillable]);

  const inlineComputedBill = useMemo(() => {
    if (!selectedProject) {
      return {
        billableCost: 0,
        imsInvestment: 0,
        billExVat: 0,
        vatAmount: 0,
        billWithVat: 0,
        aitDeducted: 0,
        expectedInflow: 0,
      };
    }
    const bCost =
      inlineBillableCostStr.trim() !== ""
        ? Number(inlineBillableCostStr) || 0
        : monthRequisitionBillable;
    const customExVat =
      inlineBillExVatOverrideStr.trim() !== ""
        ? Number(inlineBillExVatOverrideStr)
        : null;
    return computeCustomBillPreview({
      terms: selectedProject.terms,
      billableCost: bCost,
      imsInvestment: monthRequisitionIms,
      customBillExVat: customExVat,
    });
  }, [
    selectedProject,
    inlineBillableCostStr,
    inlineBillExVatOverrideStr,
    monthRequisitionBillable,
    monthRequisitionIms,
  ]);

  // Save client bill directly from the "Bill to client" card
  async function handleInlineSaveBill(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject || selectedProject.id === "ALL_COMPANY") return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject.id,
          forMonth: inlineServiceMonth,
          billNumber: inlineBillNo,
          poNumber: inlinePoNo,
          status: "NOT_YET_DUE",
          billableCost: Number(inlineComputedBill.billableCost.toFixed(2)),
          imsInvestment: Number(inlineComputedBill.imsInvestment.toFixed(2)),
          customBillExVat: Number(inlineComputedBill.billExVat.toFixed(2)),
          billExVat: Number(inlineComputedBill.billExVat.toFixed(2)),
          vatAmount: Number(inlineComputedBill.vatAmount.toFixed(2)),
          aitAmount: Number(inlineComputedBill.aitDeducted.toFixed(2)),
          receivedAmount: 0,
          submittedAt: inlineSubmittedOn || null,
          dueDate: computeDueDateStr(
            inlineSubmittedOn,
            selectedProject.terms.billCycleDays
          ),
          receivedAt: null,
          notes: inlineIsOpeningBalance
            ? "Opening balance bill"
            : `Client bill generated for ${selectedProject.name}`,
          isOpeningBalance: inlineIsOpeningBalance,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save bill");
        return;
      }

      toast.success("Client bill saved successfully!");
      setInlineBillNo("");
      setInlinePoNo("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Template downloader for Excel/CSV bulk import
  function handleDownloadExcelTemplate() {
    const heads = selectedProject?.costHeads?.map((h) => h.name) || [
      "Field force salary, fixed",
      "Field force, variable",
      "Back office salary, fixed",
      "Office rent",
      "Mobile",
      "Tracking",
      "Utilities",
      "Project manager",
    ];
    let csv =
      "Service Month,Cost Head,Amount (BDT),Charged To (Client/IMS),Paid Via,Note\n";
    const curM = new Date().toISOString().slice(0, 7);
    heads.forEach((h) => {
      csv += `${curM},"${h}",0,Client,Bank,\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IMS_Expense_Template_${selectedProject?.code || "IMS"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Record payment received directly from the side-by-side form in Receivables (accumulates onto prior partial payments)
  async function handleQuickRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!quickPayBillId) return;
    let matchedBill: ClientBillItem | null = null;
    let matchedProj: ProjectFinanceItem | null = null;
    for (const p of currentList) {
      const b = p.bills.find((x) => x.id === quickPayBillId);
      if (b) {
        matchedBill = b;
        matchedProj = p;
        break;
      }
    }
    if (!matchedBill || !matchedProj) return;

    setSaving(true);
    try {
      const installmentNum = Number(quickPayAmountStr || 0);
      const cumulativeReceived = Number(
        ((matchedBill.receivedAmount || 0) + installmentNum).toFixed(2)
      );
      const isPaidFull =
        Math.abs(cumulativeReceived - matchedBill.expectedInflow) <=
          PAYMENT_TOLERANCE_BDT ||
        cumulativeReceived >= matchedBill.expectedInflow;

      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: matchedBill.id,
          projectId: matchedProj.id,
          forMonth: matchedBill.forMonth,
          billNumber: matchedBill.billNumber,
          poNumber: matchedBill.poNumber,
          status: isPaidFull ? "PAID" : "PARTIAL_PAID",
          billableCost: matchedBill.billableCost,
          imsInvestment: matchedBill.imsInvestment,
          billExVat: matchedBill.billExVat,
          vatAmount: matchedBill.vatAmount,
          aitAmount: matchedBill.aitAmount,
          receivedAmount: cumulativeReceived,
          submittedAt: matchedBill.submittedAt,
          dueDate: matchedBill.dueDate,
          receivedAt: quickPayDate || new Date().toISOString().slice(0, 10),
          deviationReason: quickPayDeviationReason,
          notes: matchedBill.notes,
          isOpeningBalance: matchedBill.isOpeningBalance,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to record payment");
        return;
      }
      toast.success("Payment recorded successfully!");
      setQuickPayAmountStr("");
      setQuickPayDeviationReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Disburse approved funds with line-by-line payout
  async function handleDisburseRequisition(req: RequisitionSummaryItem) {
    if (!disbursePinOrPassword.trim()) {
      toast.error("Please enter your 4-digit PIN or login password to authorize disbursement.");
      return;
    }
    setSaving(true);
    try {
      const disbursementLines: Array<{ id: string; disbursedAmount: number }> = [];
      if (req.items && req.items.length > 0) {
        for (const item of req.items) {
          const val =
            disburseLineAmounts[item.id] !== undefined
              ? Number(disburseLineAmounts[item.id])
              : item.amount;
          disbursementLines.push({
            id: item.id,
            disbursedAmount: val,
          });
        }
      }

      const res = await fetch(`/api/requisitions/${req.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXECUTE",
          pinOrPassword: disbursePinOrPassword.trim(),
          paymentMethod: disbursePaidBy,
          paymentRef: disburseBankRef,
          comment: `Disbursed on ${disbursePaymentDate} via ${disbursePaidBy}${
            disburseBankRef ? ` (Ref: ${disburseBankRef})` : ""
          }`,
          disbursementLines:
            disbursementLines.length > 0 ? disbursementLines : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to disburse requisition");
        return;
      }
      toast.success("Requisition marked as disbursed & funds executed!");
      setSelectedDisburseReqId("");
      setDisbursePinOrPassword("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Toggle Month Close / Reopen per row in the Month Close checklist table
  async function handleRowCloseOrReopenMonth(
    project: ProjectFinanceItem,
    targetMonth: string,
    isCurrentlyClosed: boolean
  ) {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: isCurrentlyClosed ? "REOPEN_MONTH" : "CLOSE_MONTH",
          projectId: project.id,
          forMonth: targetMonth,
          reason: isCurrentlyClosed
            ? "Reopened from Month Close checklist"
            : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update month close status");
        return;
      }
      toast.success(
        isCurrentlyClosed
          ? `${project.name} (${targetMonth}) reopened.`
          : `${project.name} (${targetMonth}) closed.`
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const liveBillWithVat =
    Number(formBillExVat || 0) + Number(formVatAmt || 0);
  const liveExpectedInflow =
    Number(formBillExVat || 0) - Number(formAitAmt || 0);
  const liveDeviation =
    Number(formReceivedAmt || 0) - liveExpectedInflow;

  return (
    <div className="mt-5 space-y-6">
      {/* STEP 1: CLEAN SELECTOR BAR (PROJECTS vs EVENTS vs IMS GROUP EXPENSES + 7 VIEW MODES) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* 1A. Category Switcher (Only shown when user has access to 2 or more categories) */}
        {[
          permanentProjects.length > 0,
          eventProjects.length > 0,
          companyDivisions.length > 0,
        ].filter(Boolean).length > 1 && (
          <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
            <div className="inline-flex flex-wrap bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0 gap-1">
              {permanentProjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveType("PERMANENT")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeType === "PERMANENT"
                      ? "bg-gray-900 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📁 Projects ({permanentProjects.length})
                </button>
              )}
              {eventProjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveType("EVENT")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeType === "EVENT"
                      ? "bg-purple-700 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  🎪 Events ({eventProjects.length})
                </button>
              )}
              {companyDivisions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveType("COMPANY")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeType === "COMPANY"
                      ? "bg-rose-700 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  🏢 IMS Group ({companyDivisions.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* 1B. Fixed-Position Quick View Mode Pills (Role-clean tabs) */}
        <div
          className={`flex flex-wrap items-center gap-1.5 ${
            viewMode !== "NEW_ENTRY" ? "pb-3 border-b border-gray-100" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setViewMode("SUMMARY_MATRIX")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "SUMMARY_MATRIX"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            📊 Profit Summary
          </button>
          {canEditFinance && (
            <button
              type="button"
              onClick={() => setViewMode("NEW_ENTRY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "NEW_ENTRY"
                  ? "bg-[#E42528] text-white shadow-sm"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              🧾 Bill to Client
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode("AGEING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "AGEING"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ✅ Receivables &amp; Bills
          </button>
          {canDisburse && (
            <button
              type="button"
              onClick={() => setViewMode("DISBURSE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "DISBURSE"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              💸 Disburse
              {approvalPipelineCounts.readyDisburseCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-950 text-[10px] font-extrabold">
                  {approvalPipelineCounts.readyDisburseCount}
                </span>
              )}
            </button>
          )}
          {canCloseMonth && (
            <button
              type="button"
              onClick={() => setViewMode("MONTH_CLOSE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "MONTH_CLOSE"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              🔒 Month Close
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode("GROUP_OVERVIEW")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "GROUP_OVERVIEW"
                ? "bg-cyan-700 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            👥 Group Overview
          </button>
          <button
            type="button"
            onClick={() => setViewMode("SINGLE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "SINGLE"
                ? "bg-slate-700 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            🔍 Project Details
          </button>
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
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                  Period:
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-10 rounded-lg border-2 border-gray-300 bg-white px-3 text-xs font-bold text-gray-800 shadow-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="ALL">All Months (Cumulative)</option>
                  {availableMonths.map((m) => {
                    const isClosed = Boolean(
                      selectedProject.closedMonths &&
                        selectedProject.closedMonths[m]
                    );
                    return (
                      <option key={m} value={m}>
                        {m} {isClosed ? "🔒 (Closed)" : ""}
                      </option>
                    );
                  })}
                </select>

                {selectedProject.id !== "ALL_COMPANY" && canCloseMonth && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetM =
                        selectedMonth !== "ALL"
                          ? selectedMonth
                          : new Date().toISOString().slice(0, 7);
                      const alreadyClosed = Boolean(
                        selectedProject.closedMonths &&
                          selectedProject.closedMonths[targetM]
                      );
                      setCloseMonthTarget(targetM);
                      setCloseMonthMode(alreadyClosed ? "REOPEN" : "CLOSE");
                      setCloseMonthReason("");
                      setCloseMonthModalOpen(true);
                    }}
                    className={`h-10 px-3 rounded-lg text-xs font-bold border shadow-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      selectedMonth !== "ALL" &&
                      selectedProject.closedMonths?.[selectedMonth]
                        ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                        : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                    }`}
                  >
                    <span>
                      {selectedMonth !== "ALL" &&
                      selectedProject.closedMonths?.[selectedMonth]
                        ? "🔓 Reopen Closed Month"
                        : "🔒 Close Month"}
                    </span>
                  </button>
                )}

                {selectedProject.id !== "ALL_COMPANY" && (
                  <a
                    href={`/requisitions/new?projectId=${selectedProject.id}`}
                    className="h-10 px-3 rounded-lg text-xs font-bold bg-[#E42528] text-white hover:bg-red-700 shadow-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                  >
                    <span>➕ New Requisition</span>
                  </a>
                )}
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
                  onClick={() => setMatrixPeriodView("QUARTERLY")}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${
                    matrixPeriodView === "QUARTERLY"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600"
                  }`}
                >
                  Quarterly &amp; Half-Year
                </button>
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
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportManagementExcel}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition-colors"
            >
              📥 Export Summary (.xls)
            </button>
          </div>
        )}

        {viewMode === "AGEING" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Maturity tracking: <strong>Due Date = Submitted Date + Project Cycle Days</strong> (with ±10 BDT rounding tolerance).
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

        {viewMode === "DISBURSE" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Finance Disburse: Line-by-line part payments allowed. Executing pays out approved funds and logs transaction vouchers.
            </div>
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
              Ready to Disburse: {disburseWaitingReqs.length} Requisition(s)
            </div>
          </div>
        )}

        {viewMode === "MONTH_CLOSE" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Closing a month locks its numbers so net profit counts as verified actual.
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-700">Month:</label>
              <input
                type="month"
                value={allCloseMonthTarget}
                onChange={(e) => setAllCloseMonthTarget(e.target.value)}
                className="h-9 px-3 rounded-lg border-2 border-gray-300 text-xs font-bold"
              />
            </div>
          </div>
        )}

        {viewMode === "GROUP_OVERVIEW" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Overview for Group / BD Heads to track profitability, outstanding collections, and missing entries.
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-700">Filter KAM:</label>
              <select
                value={groupKamFilter}
                onChange={(e) => setGroupKamFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border-2 border-gray-300 text-xs font-bold"
              >
                <option value="ALL">All KAMs</option>
                {Array.from(
                  new Set(
                    currentList
                      .map((p) => p.headName)
                      .filter(Boolean)
                  )
                ).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================
          VIEW 1: MANAGEMENT PROFIT SUMMARY (§7.7 & §9 + CLEAN v3 UI)
         ======================================================================== */}
      {viewMode === "SUMMARY_MATRIX" && (
        <div className="space-y-5">
          {/* 4 Clean Top KPI Cards (from v3/Summary.html) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Net profit, full year
              </div>
              <div className="text-2xl font-black text-gray-900 mt-1 font-mono">
                Tk {formatBDT(managementMatrix.grandFullYear)}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                All projects · {matrixYear} · After IMS investment
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                H1 actual (Jan–Jun)
              </div>
              <div className="text-2xl font-black text-blue-950 mt-1 font-mono">
                Tk {formatBDT(managementMatrix.grandH1)}
              </div>
              <div className="text-[11px] text-blue-600 mt-1">
                {managementMatrix.grandFullYear > 0
                  ? Math.round(
                      (managementMatrix.grandH1 / managementMatrix.grandFullYear) *
                        100
                    )
                  : 0}
                % of full year achieved
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide">
                H2 forecast (Jul–Dec)
              </div>
              <div className="text-2xl font-black text-indigo-950 mt-1 font-mono">
                Tk {formatBDT(managementMatrix.grandH2)}
              </div>
              <div className="text-[11px] text-indigo-600 mt-1">
                Auto 3M average with manual overrides
              </div>
            </div>

            <div className="bg-amber-50/70 rounded-xl p-5 border border-amber-200 shadow-sm">
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                IMS investment, YTD
              </div>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">
                Tk {formatBDT(
                  currentList.reduce((s, p) => s + p.totalImsInvReq, 0)
                )}
              </div>
              <div className="text-[11px] text-amber-800 mt-1">
                Internal costs not billed to clients
              </div>
            </div>
          </div>

          {/* Compact 2-Column Row: Small Bar Chart (Left) + Top 5 Projects (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Compact Net Profit Bar Chart */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-bold text-gray-900">
                    Net profit by {matrixPeriodView === "MONTHLY" ? "month" : "quarter"} (BDT lakh)
                  </h3>
                  <div className="text-[11px] text-gray-500">
                    Solid = Actual • Light = Forecast
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-[11px]">
                  <span className="flex items-center gap-1 text-gray-700 font-semibold">
                    <span className="w-2.5 h-2.5 bg-[#1F4E8C] rounded-xs inline-block"></span> Actual
                  </span>
                  <span className="flex items-center gap-1 text-gray-700 font-semibold">
                    <span className="w-2.5 h-2.5 bg-blue-300 rounded-xs inline-block"></span> Forecast
                  </span>
                </div>
              </div>

              <div className="pt-4 pb-1">
                {matrixPeriodView === "MONTHLY" ? (
                  <div className="grid grid-cols-12 gap-1.5 items-end h-28 px-1 border-b border-gray-200">
                    {MONTH_NAMES.map((name, idx) => {
                      const val = managementMatrix.monthTotals[idx] || 0;
                      const lakh = (val / 100000).toFixed(1);
                      const maxVal = Math.max(...managementMatrix.monthTotals, 100000);
                      const heightPct = Math.max(10, Math.min(100, Math.round((Math.abs(val) / maxVal) * 82)));
                      const isForecastMonth = idx >= 6;
                      return (
                        <div key={name} className="flex flex-col items-center h-full justify-end">
                          <span className="text-[9px] font-bold text-gray-700 mb-0.5 font-mono">
                            {lakh}
                          </span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-xs transition-all ${
                              isForecastMonth
                                ? "bg-blue-300 hover:bg-blue-400"
                                : "bg-[#1F4E8C] hover:bg-[#163a69]"
                            }`}
                            title={`${name} ${matrixYear}: Tk ${formatBDT(val)}`}
                          ></div>
                          <span className="text-[9px] font-bold text-gray-600 mt-1">
                            {name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4 items-end h-28 px-4 border-b border-gray-200">
                    {[
                      { label: "Q1", val: managementMatrix.grandQ1, isFc: false },
                      { label: "Q2", val: managementMatrix.grandQ2, isFc: false },
                      { label: "Q3", val: managementMatrix.grandQ3, isFc: false },
                      { label: "Q4", val: managementMatrix.grandQ4, isFc: true },
                    ].map(({ label, val, isFc }) => {
                      const lakh = (val / 100000).toFixed(1);
                      const maxVal = Math.max(
                        managementMatrix.grandQ1,
                        managementMatrix.grandQ2,
                        managementMatrix.grandQ3,
                        managementMatrix.grandQ4,
                        100000
                      );
                      const heightPct = Math.max(14, Math.min(100, Math.round((Math.abs(val) / maxVal) * 82)));
                      return (
                        <div key={label} className="flex flex-col items-center h-full justify-end">
                          <span className="text-[11px] font-bold text-gray-800 mb-1 font-mono">
                            {lakh}L
                          </span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full max-w-[52px] rounded-t-sm transition-all ${
                              isFc
                                ? "bg-blue-300 hover:bg-blue-400"
                                : "bg-[#1F4E8C] hover:bg-[#163a69]"
                            }`}
                            title={`${label} ${matrixYear}: Tk ${formatBDT(val)}`}
                          ></div>
                          <span className="text-[11px] font-bold text-gray-700 mt-1.5">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Compact Top 5 Projects Ranking */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-bold text-gray-900">
                    Top {Math.min(5, rankedProjectsByProfit.length)} {activeType === "EVENT" ? "Events" : "Projects"} by Profit
                  </h3>
                  <div className="text-[11px] text-gray-500">
                    Click any item to open its detailed P&amp;L
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportManagementExcel}
                  className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
                >
                  Download Excel
                </button>
              </div>
              <div className="mt-2.5 space-y-2">
                {rankedProjectsByProfit.slice(0, 5).map((row) => {
                  const sharePct =
                    managementMatrix.grandFullYear > 0
                      ? Math.max(
                          0,
                          Math.round(
                            (row.fullYearTotal / managementMatrix.grandFullYear) *
                              100
                          )
                        )
                      : 0;
                  const barWidth = Math.max(
                    4,
                    Math.min(
                      100,
                      Math.round((row.fullYearTotal / maxProjectProfit) * 100)
                    )
                  );
                  return (
                    <button
                      key={row.project.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(row.project.id);
                        setViewMode("SINGLE");
                      }}
                      className="w-full text-left group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[11px] gap-2">
                        <span className="font-semibold text-gray-800 group-hover:text-blue-700 truncate">
                          {row.project.name}
                        </span>
                        <span className="font-mono font-bold text-gray-900 shrink-0">
                          Tk {formatCompactBDT(row.fullYearTotal)}{" "}
                          <span className="text-[10px] font-normal text-gray-400">
                            ({sharePct}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className="bg-[#E42528] h-full rounded-full"
                        ></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Slim Consolidated Group Bottom-Line Strip (ONLY for Full Unrestricted Report Access / MD / Accounts / Super Admin) */}
          {isFullReportAccess && (
            <div className="bg-slate-900 text-white rounded-xl px-4 py-3 shadow-sm border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                🏦 Group Bottom-Line ({matrixYear}):
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono">
                <span>
                  <span className="text-blue-300 font-sans">Projects:</span>{" "}
                  <strong>Tk {formatCompactBDT(consolidatedGroupStats.projMatrix.grandActualYtd)}</strong>
                </span>
                <span>
                  <span className="text-purple-300 font-sans">+ Events:</span>{" "}
                  <strong>Tk {formatCompactBDT(consolidatedGroupStats.evtMatrix.grandActualYtd)}</strong>
                </span>
                <span>
                  <span className="text-rose-300 font-sans">− Group OPEX:</span>{" "}
                  <strong className="text-rose-200">Tk {formatCompactBDT(consolidatedGroupStats.compMatrix.grandActualYtd)}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-600 text-emerald-300 font-bold">
                  ＝ True Net: {consolidatedGroupStats.trueGroupBottomLineYtd >= 0 ? "+" : ""}Tk{" "}
                  {formatCompactBDT(consolidatedGroupStats.trueGroupBottomLineYtd)}
                </span>
              </div>
            </div>
          )}

          {/* Matrix Table (Clean Quarterly-first, switchable to Monthly) */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 bg-gray-50/70">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  📊 {activeType === "COMPANY"
                    ? `IMS Group Internal Overhead Expenses Matrix — ${matrixYear}`
                    : `Management Net Profit Summary — ${
                        activeType === "PERMANENT" ? "Projects" : "Events"
                      } (${matrixYear})`}
                </h3>
                <p className="text-xs text-gray-500">
                  Click any row name to drill down into single item view, or click any future cell to override its forecast.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                  Amber = Auto 3M Forecast
                </span>
                <span className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold">
                  Purple = Manual Override
                </span>
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
                        : "Division"}
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
                        <th className="py-2.5 px-2.5 text-right">Q4 forecast</th>
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
                            onClick={() => {
                              if (
                                canEditFinance &&
                                !c.hasActual &&
                                row.project.id !== "ALL_COMPANY"
                              ) {
                                setForecastTargetProject(row.project);
                                setForecastTargetMonth(c.monthKey);
                                setForecastAmountStr(
                                  String(Math.round(c.netProfit || 0))
                                );
                                setForecastNoteStr(
                                  c.manualForecastNote || "Manual forecast override"
                                );
                                setForecastModalOpen(true);
                              }
                            }}
                            className={`py-2.5 px-2 text-right font-mono ${
                              !c.hasActual && canEditFinance
                                ? "cursor-pointer hover:ring-1 hover:ring-purple-400"
                                : ""
                            } ${
                              c.isManualForecast
                                ? "bg-purple-50 text-purple-900 font-bold"
                                : c.isForecast
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
                            {c.isClosed && (
                              <span className="text-[9px] mr-0.5" title="Closed Month">
                                🔒
                              </span>
                            )}
                            {c.hasActual || c.isForecast
                              ? formatCompactBDT(c.netProfit)
                              : "—"}
                            {c.isManualForecast && (
                              <span className="block text-[8px] font-sans uppercase text-purple-700 leading-none">
                                Manual
                              </span>
                            )}
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
                      TOTAL ({managementMatrix.rows.length})
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
          VIEW 2: BILL TO CLIENT — CLEAN EDITABLE CLIENT INVOICE FORM
         ======================================================================== */}
      {viewMode === "NEW_ENTRY" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[#E42528] uppercase tracking-wider">
                CLIENT BILLING &amp; INVOICES
              </div>
              <h2 className="text-xl font-black text-gray-900 mt-0.5">
                Bill to Client — Record Monthly Invoice
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                All project &amp; event expenses come from approved Requisitions. Use this form to record the Client Invoice &amp; PO details.
              </p>
            </div>
            <a
              href={`/requisitions/new?projectId=${selectedProject?.id || ""}&forMonth=${inlineServiceMonth}`}
              className="px-3.5 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 shadow-xs transition-colors"
            >
              ➕ Create Expense Requisition (With CSV Import) ↗
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2/3: Editable Bill to Client Form */}
            <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    🧾 Bill to Client — {selectedProject?.name || "Select Project"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Pre-filled from this month&apos;s approved requisitions, or type custom amounts below.
                  </p>
                </div>
                {(inlineBillableCostStr !== String(monthRequisitionBillable || 0) ||
                  inlineBillExVatOverrideStr !== "") && (
                  <button
                    type="button"
                    onClick={() => {
                      setInlineBillableCostStr(String(monthRequisitionBillable || 0));
                      setInlineBillExVatOverrideStr("");
                    }}
                    className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded border border-blue-200 cursor-pointer"
                  >
                    ↺ Reset to Requisition Cost (Tk {formatBDT(monthRequisitionBillable)})
                  </button>
                )}
              </div>

              <form onSubmit={handleInlineSaveBill} className="space-y-4">
                {/* Row 1: Project + Service Month + Submitted On */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Project / Event
                    </label>
                    <select
                      value={selectedProject?.id || ""}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold bg-white"
                    >
                      {currentList
                        .filter((p) => p.id !== "ALL_COMPANY")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Service Month
                    </label>
                    <input
                      type="month"
                      value={inlineServiceMonth}
                      onChange={(e) => setInlineServiceMonth(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Submitted On
                    </label>
                    <input
                      type="date"
                      value={inlineSubmittedOn}
                      onChange={(e) => setInlineSubmittedOn(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold bg-white"
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Bill Number + PO Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Bill / Invoice Number *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2026/08/491/SME"
                      value={inlineBillNo}
                      onChange={(e) => setInlineBillNo(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Client PO / Work Order Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 4600000585"
                      value={inlinePoNo}
                      onChange={(e) => setInlinePoNo(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold bg-white"
                    />
                  </div>
                </div>

                {/* Row 3: Editable Cost & Invoice Breakdown Card */}
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/70 space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-gray-200">
                    <div>
                      <span className="font-bold text-gray-800 block">
                        Billable Cost (BDT)
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Requisitions for {inlineServiceMonth}: Tk{" "}
                        {formatBDT(monthRequisitionBillable)} (Editable)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-bold">Tk</span>
                      <input
                        type="number"
                        step="0.01"
                        value={inlineBillableCostStr}
                        onChange={(e) => setInlineBillableCostStr(e.target.value)}
                        className="w-44 h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-right font-mono font-bold text-gray-900 focus:border-[#E42528] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-gray-200">
                    <div>
                      <span className="font-bold text-gray-800 block">
                        Bill Without VAT (Ex-VAT Invoice Amount)
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Auto-calculated from{" "}
                        {BILLING_MODEL_LABELS[
                          selectedProject?.terms.billingProfile || ""
                        ] || "Billing Terms"}{" "}
                        ({((selectedProject?.terms.feeRate || 0) * 100).toFixed(1)}%
                        fee), or type custom invoice amount
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-bold">Tk</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={inlineComputedBill.billExVat.toFixed(2)}
                        value={
                          inlineBillExVatOverrideStr !== ""
                            ? inlineBillExVatOverrideStr
                            : inlineComputedBill.billExVat.toFixed(2)
                        }
                        onChange={(e) =>
                          setInlineBillExVatOverrideStr(e.target.value)
                        }
                        className="w-44 h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-right font-mono font-bold text-blue-950 focus:border-[#E42528] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-gray-200">
                    <span className="text-gray-600">
                      Bill With VAT (
                      {((selectedProject?.terms.vatRate ?? 0.15) * 100).toFixed(1)}
                      %)
                    </span>
                    <span className="font-mono font-bold text-gray-900">
                      Tk {formatBDT(inlineComputedBill.billWithVat)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-gray-200 bg-emerald-50 px-2.5 rounded-lg">
                    <span className="font-bold text-emerald-900">
                      Expected Payment (After AIT{" "}
                      {((selectedProject?.terms.aitRate ?? 0) * 100).toFixed(1)}%)
                    </span>
                    <span className="font-mono font-bold text-emerald-950">
                      Tk {formatBDT(inlineComputedBill.expectedInflow)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 text-gray-500 pt-1">
                    <span>Payment Due Date</span>
                    <span className="font-semibold text-gray-700">
                      {computeDueDateStr(
                        inlineSubmittedOn,
                        selectedProject?.terms.billCycleDays || 30
                      )}{" "}
                      · {selectedProject?.terms.billCycleDays || 30} days cycle
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg bg-[#E42528] text-white text-xs font-bold hover:bg-red-700 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving bill..." : "Save Client Bill"}
                </button>
              </form>
            </div>

            {/* Right 1/3: Recent Client Bills for Selected Project */}
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Recent Bills — {selectedProject?.name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Invoices recorded for this project/event.
                </p>
              </div>

              {(selectedProject?.bills || []).length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-lg border border-gray-100">
                  No client bills recorded yet for this project.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(selectedProject?.bills || []).slice(0, 8).map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-lg border border-gray-200 bg-gray-50/60 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 truncate">
                          {b.billNumber || "Draft Bill"} • {b.forMonth}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Ex-VAT: Tk {formatBDT(b.billExVat)} • Due:{" "}
                          {b.dueDate || "—"}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-800 shrink-0">
                        Tk {formatBDT(b.expectedInflow)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          VIEW 3: RECEIVABLES & CONFIRMATIONS (§4.4, §7.6 + CLEAN v3 UI)
         ======================================================================== */}
      {viewMode === "AGEING" && (
        <ReceivablesAgeingView
          receivablesAgeing={receivablesAgeing}
          ageingFilter={ageingFilter}
          setAgeingFilter={setAgeingFilter}
          quickPayBillId={quickPayBillId}
          setQuickPayBillId={setQuickPayBillId}
          quickPayDate={quickPayDate}
          setQuickPayDate={setQuickPayDate}
          quickPayAmountStr={quickPayAmountStr}
          setQuickPayAmountStr={setQuickPayAmountStr}
          quickPayDeviationReason={quickPayDeviationReason}
          setQuickPayDeviationReason={setQuickPayDeviationReason}
          setSelectedTimelineBillId={setSelectedTimelineBillId}
          saving={saving}
          onQuickRecordPayment={handleQuickRecordPayment}
        />
      )}

      {/* ========================================================================
          VIEW 4: DISBURSE APPROVED FUNDS (FINANCE DISBURSE SCREEN)
         ======================================================================== */}
      {viewMode === "DISBURSE" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Approved requisitions waiting for payment ({disburseWaitingReqs.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Requisitions approved by MD ready for fund payout. Part payments allowed.
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3">Requisition</th>
                    <th className="py-2.5 px-3">Project</th>
                    <th className="py-2.5 px-3">Approved on</th>
                    <th className="py-2.5 px-3 text-right">Approved</th>
                    <th className="py-2.5 px-3 text-right">Needed by</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {disburseWaitingReqs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">
                        ✓ No approved requisitions waiting for payment. All funds are disbursed.
                      </td>
                    </tr>
                  ) : (
                    disburseWaitingReqs.map(({ project, req }) => (
                      <tr
                        key={req.id}
                        className={`hover:bg-emerald-50/50 transition-colors ${
                          selectedDisburseReqId === req.id ? "bg-emerald-50" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                          {req.number}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-gray-800">
                          {project.name}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {req.approvedAt || req.date}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                          Tk {formatBDT(req.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-600">
                          {req.disburseOn || "Immediate"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedDisburseReqId(req.id)}
                            className="px-3 py-1 rounded bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800"
                          >
                            Pay Out →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Line-by-line payout section when a requisition is selected */}
          {selectedDisburseReqId && (() => {
            const matched = disburseWaitingReqs.find((x) => x.req.id === selectedDisburseReqId);
            if (!matched) return null;
            const { project, req } = matched;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        Lines to pay · {req.number} ({project.name})
                      </h4>
                      <p className="text-xs text-gray-500">
                        Adjust amounts per line if paying partially.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(req.items && req.items.length > 0 ? req.items : [
                      { id: "def", costHead: "General Spend", particulars: "Approved Requisition Spend", amount: req.total }
                    ]).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/60"
                      >
                        <div>
                          <div className="font-bold text-xs text-gray-900">{it.costHead || it.particulars}</div>
                          <div className="text-[11px] text-gray-500">Approved: Tk {formatBDT(it.amount)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 font-semibold">Paying now:</span>
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={it.amount}
                            onChange={(e) => {
                              setDisburseLineAmounts({
                                ...disburseLineAmounts,
                                [it.id]: e.target.value,
                              });
                            }}
                            className="w-32 h-8 px-2 rounded border border-gray-300 text-xs font-mono font-bold text-right"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold text-gray-900">Payment details</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Payment date</label>
                      <input
                        type="date"
                        value={disbursePaymentDate}
                        onChange={(e) => setDisbursePaymentDate(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Paid via</label>
                      <select
                        value={disbursePaidBy}
                        onChange={(e) => setDisbursePaidBy(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs font-bold"
                      >
                        <option value="BANK">Bank Transfer / Cheque</option>
                        <option value="PETTY_CASH">Petty Cash</option>
                        <option value="BKASH">bKash / MFS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Reference / Cheque #</label>
                      <input
                        type="text"
                        placeholder="e.g. TR-2026-9021"
                        value={disburseBankRef}
                        onChange={(e) => setDisburseBankRef(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Your 4-Digit PIN or Login Password *
                      </label>
                      <input
                        type="password"
                        placeholder="Enter PIN or password to sign execution"
                        value={disbursePinOrPassword}
                        onChange={(e) => setDisbursePinOrPassword(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs font-mono"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDisburseRequisition(req)}
                      className="w-full py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 shadow-sm mt-2 cursor-pointer"
                    >
                      {saving ? "Executing..." : "Record Payment & Disburse"}
                    </button>

                    <a
                      href={`/requisitions/${req.id}`}
                      className="block w-full text-center py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold transition-colors"
                    >
                      Open Full Voucher &amp; Sign ↗
                    </a>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================
          VIEW 5: MONTH CLOSE CHECKLIST
         ======================================================================== */}
      {viewMode === "MONTH_CLOSE" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Month close: {allCloseMonthTarget}
                </h3>
                <p className="text-xs text-gray-500">
                  Closing a month locks its figures; net profit then counts as verified actual.
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3">Project</th>
                    <th className="py-2.5 px-3">Requisition paid</th>
                    <th className="py-2.5 px-3">Expenses confirmed</th>
                    <th className="py-2.5 px-3">Bill submitted</th>
                    <th className="py-2.5 px-3 text-right">Net profit</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentList
                    .filter((p) => p.id !== "ALL_COMPANY")
                    .map((project) => {
                      const isClosed = Boolean(
                        project.closedMonths && project.closedMonths[allCloseMonthTarget]
                      );
                      const monthBills = project.bills.filter(
                        (b) => b.forMonth === allCloseMonthTarget
                      );
                      const hasBill = monthBills.length > 0;
                      return (
                        <tr key={project.id} className="hover:bg-gray-50">
                          <td className="py-3 px-3 font-semibold text-gray-900">{project.name}</td>
                          <td className="py-3 px-3 text-emerald-700 font-bold">Yes</td>
                          <td className="py-3 px-3 text-emerald-700 font-bold">All confirmed</td>
                          <td className="py-3 px-3">
                            {hasBill ? (
                              <span className="text-emerald-700 font-bold">
                                {monthBills[0].submittedAt || "Yes"}
                              </span>
                            ) : (
                              <span className="text-amber-800 font-semibold">No bill</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">
                            Tk {formatBDT(project.overallCalc?.netProfit || 0)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {isClosed ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                Closed
                              </span>
                            ) : hasBill ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">
                                Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                No bill
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {canCloseMonth && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  handleRowCloseOrReopenMonth(
                                    project,
                                    allCloseMonthTarget,
                                    isClosed
                                  )
                                }
                                className={`px-3 py-1 rounded text-xs font-bold ${
                                  isClosed
                                    ? "bg-gray-100 hover:bg-gray-200 text-gray-800"
                                    : "bg-blue-700 hover:bg-blue-800 text-white"
                                }`}
                              >
                                {isClosed ? "Reopen" : "Close"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h4 className="text-xs font-bold text-gray-900 uppercase">Close rules</h4>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              A project-month can be closed when its requisition is fully paid or settled, every expense is confirmed, and at least one bill is recorded. Reopening needs a reason and is recorded in the audit log.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================
          VIEW 6: GROUP OVERVIEW & FOLLOW-UP (GROUP HEAD DASHBOARD)
         ======================================================================== */}
      {viewMode === "GROUP_OVERVIEW" && (
        <div className="space-y-6">
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Net profit, YTD
              </div>
              <div className="text-2xl font-black text-gray-900 mt-1 font-mono">
                Tk {formatBDT(managementMatrix.grandActualYtd)}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                From {currentList.length} portfolio project(s)
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                Outstanding bills
              </div>
              <div className="text-2xl font-black text-blue-950 mt-1 font-mono">
                Tk {formatBDT(receivablesAgeing.notYetDueTotal + receivablesAgeing.overdue1To30Total + receivablesAgeing.overdue31To60Total + receivablesAgeing.overdue60PlusTotal)}
              </div>
              <div className="text-[11px] text-blue-600 mt-1">
                Awaiting client collection
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-red-700 uppercase tracking-wide">
                Overdue bills
              </div>
              <div className="text-2xl font-black text-red-950 mt-1 font-mono">
                {receivablesAgeing.overdue1To30Count + receivablesAgeing.overdue31To60Count + receivablesAgeing.overdue60PlusCount}
              </div>
              <div className="text-[11px] text-red-600 mt-1">
                Bills past contractual credit cycle
              </div>
            </div>

            <div className="bg-amber-50/70 rounded-xl p-5 border border-amber-200 shadow-sm">
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                IMS investment, YTD
              </div>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">
                Tk {formatBDT(currentList.reduce((s, p) => s + p.totalImsInvReq, 0))}
              </div>
              <div className="text-[11px] text-amber-800 mt-1">
                Costs borne by agency
              </div>
            </div>
          </div>

          {/* 2-Column Split: Projects in Group Table (2/3) + Follow Up Card (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">
                  Projects in my group ({currentList.filter((p) => p.id !== "ALL_COMPANY").length})
                </h3>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3">Project</th>
                      <th className="py-2.5 px-3">KAM</th>
                      <th className="py-2.5 px-3 text-right">Net profit, YTD</th>
                      <th className="py-2.5 px-3 text-right">Bills</th>
                      <th className="py-2.5 px-3 text-right">Entries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {currentList
                      .filter(
                        (p) =>
                          p.id !== "ALL_COMPANY" &&
                          (groupKamFilter === "ALL" || p.headName === groupKamFilter)
                      )
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="py-2.5 px-3 font-semibold text-gray-900">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(p.id);
                                setViewMode("SINGLE");
                              }}
                              className="text-left text-blue-700 hover:underline"
                            >
                              {p.name}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{p.headName || "KAM"}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            Tk {formatBDT(p.overallCalc?.netProfit || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                              On time
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900">
                              Complete
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-gray-900 uppercase">Follow up this week</h4>
                <ul className="text-xs space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500">●</span>
                    <span>
                      {receivablesAgeing.overdue1To30Count + receivablesAgeing.overdue31To60Count + receivablesAgeing.overdue60PlusCount} bills overdue across portfolio
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">●</span>
                    <span>Q4 forecasts due from all KAMs by 25th of month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500">●</span>
                    <span>{approvalPipelineCounts.groupHeadCount} requisition(s) waiting for Group Head approval</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-2">
                <h4 className="text-xs font-bold text-gray-900 uppercase">Fund requisitions</h4>
                <p className="text-xs text-gray-500">
                  {approvalPipelineCounts.totalPending} requisitions waiting in the approval chain.
                </p>
                <a
                  href="/requisitions?filter=pending"
                  className="inline-block mt-1 text-xs font-bold text-[#E42528] hover:underline"
                >
                  Open Approvals Queue →
                </a>
              </div>
            </div>
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

              {/* STEP 4 (COMPANY): UNIFIED TABBED PANEL FOR INTERNAL REQUISITIONS & COST HEAD BREAKDOWN */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/70">
                  <div className="inline-flex flex-wrap items-center gap-1.5 bg-gray-200/70 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCompanyDetailTab("REQUISITIONS")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        companyDetailTab === "REQUISITIONS"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <span>📋 Internal Requisitions</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200">
                        {activeStats.reqs.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompanyDetailTab("COST_HEADS")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        companyDetailTab === "COST_HEADS"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <span>🧾 Breakdown by Cost Head</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200">
                        {costHeadPieData.length}
                      </span>
                    </button>
                  </div>
                  <div className="text-xs font-semibold text-gray-600">
                    Total Overhead:{" "}
                    <strong className="font-mono text-rose-900">
                      Tk {formatBDT(activeStats.totalSpend)}
                    </strong>
                  </div>
                </div>

                {companyDetailTab === "REQUISITIONS" && (
                  <>
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
                  </>
                )}

                {companyDetailTab === "COST_HEADS" && (
                  <>

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
                  </>
                )}
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
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">
                        {BILLING_MODEL_LABELS[
                          selectedProject.terms.billingProfile
                        ] || selectedProject.terms.billingProfile}
                      </span>
                      <span>·</span>
                      <span>
                        {(selectedProject.terms.feeRate * 100).toFixed(1)}% Fee
                        {selectedProject.terms.reimbursementTaxDivisor &&
                        selectedProject.terms.reimbursementTaxDivisor < 1
                          ? ` · ÷${selectedProject.terms.reimbursementTaxDivisor} Claim`
                          : ""}
                        {selectedProject.terms.fixedKamRecovery &&
                        selectedProject.terms.fixedKamRecovery > 0
                          ? ` · +Tk ${formatCompactBDT(
                              selectedProject.terms.fixedKamRecovery
                            )} KAM`
                          : ""}
                      </span>
                      <span>·</span>
                      <span>
                        {(selectedProject.terms.vatRate * 100).toFixed(0)}% VAT /{" "}
                        {selectedProject.terms.billingProfile === "COST_PLUS_GROSSUP" &&
                        selectedProject.terms.aitGrossupRate !== undefined &&
                        Math.abs(
                          selectedProject.terms.aitGrossupRate -
                            selectedProject.terms.aitRate
                        ) > 0.0001
                          ? `${(selectedProject.terms.aitGrossupRate * 100).toFixed(1)}% Gross-Up · ${(selectedProject.terms.aitRate * 100).toFixed(1)}% AIT`
                          : `${(selectedProject.terms.aitRate * 100).toFixed(1)}% AIT`}
                      </span>
                      <span>·</span>
                      <span>{selectedProject.terms.billCycleDays}d Cycle</span>
                      <span>·</span>
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

              {/* STEP 3: 4 STREAMLINED KPI CARDS FOR THIS SELECTED PROJECT / EVENT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-gray-500 uppercase">
                    1. Total Requisitions Spend
                  </div>
                  <div className="text-base font-bold text-gray-900 mt-1">
                    Tk {formatBDT(activeStats.totalSpend)}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    <strong>{activeStats.reqs.length}</strong> Requisition(s) •
                    Billable: {formatBDT(activeStats.billableSpend)} • IMS:{" "}
                    {formatBDT(activeStats.imsSpend)}
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-blue-800 uppercase">
                    2. Client Bill & Expected Inflow
                  </div>
                  <div className="text-base font-bold text-blue-950 mt-1">
                    Tk {formatBDT(activeStats.billedWithVat)}
                  </div>
                  <div className="text-[11px] text-blue-700 mt-1">
                    Ex-VAT: {formatBDT(activeStats.billedExVat)} • Net Inflow (-AIT):{" "}
                    <strong>Tk {formatBDT(activeStats.expectedInflow)}</strong>
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 shadow-sm">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">
                    3. Payment Received & Due
                  </div>
                  <div className="text-base font-bold text-emerald-900 mt-1">
                    Tk {formatBDT(activeStats.receivedAmount)}
                  </div>
                  <div className="text-[11px] text-amber-800 font-semibold mt-1">
                    Remaining Due: Tk {formatBDT(activeStats.remainingDue)} (
                    {activeStats.bills.length} Bill/Pay)
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
                    4. Net Profit ({activeStats.calc.netMarginPct.toFixed(1)}% Margin)
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
                    Realized Cash P&L:{" "}
                    <strong>
                      {activeStats.realizedProfit >= 0 ? "+" : ""}Tk{" "}
                      {formatBDT(activeStats.realizedProfit)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* WORKING CAPITAL (2x / 2.5x) & ANNUALIZED ROI STRIP FOR PROJECTS */}
              {selectedProject.kind === "PERMANENT" && activeStats.totalSpend > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Avg Monthly Cost ({activeStats.activeMonthCount} mo)
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                      Tk {formatBDT(activeStats.monthlyAvgSpend)}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Req. Working Capital @ 2.0x
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                      Tk {formatBDT(activeStats.reqWc2x)}
                    </div>
                  </div>
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl px-4 py-3">
                    <div className="text-[10px] font-bold text-indigo-700 uppercase">
                      Annualized ROI @ 2.0x WC
                    </div>
                    <div className="text-sm font-bold text-indigo-950 mt-0.5">
                      {activeStats.roi2xPct.toFixed(1)}% / yr
                      <span className="ml-1.5 text-[10px] font-normal text-indigo-700">
                        (Yr Profit: Tk {formatCompactBDT(activeStats.annualizedNetProfit)})
                      </span>
                    </div>
                  </div>
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl px-4 py-3">
                    <div className="text-[10px] font-bold text-indigo-700 uppercase">
                      Req. WC @ 2.5x · Annualized ROI
                    </div>
                    <div className="text-sm font-bold text-indigo-950 mt-0.5">
                      {activeStats.roi25xPct.toFixed(1)}% / yr
                      <span className="ml-1.5 text-[10px] font-normal text-indigo-700 font-mono">
                        (WC: Tk {formatCompactBDT(activeStats.reqWc25x)})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: UNIFIED TABBED CARD FOR REQUISITIONS & PAYMENTS */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/70">
                  <div className="inline-flex flex-wrap items-center gap-1.5 bg-gray-200/70 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSingleDetailTab("REQUISITIONS")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        singleDetailTab === "REQUISITIONS"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <span>📋 Requisitions</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200">
                        {activeStats.reqs.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSingleDetailTab("PAYMENTS")}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        singleDetailTab === "PAYMENTS"
                          ? "bg-white text-emerald-800 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <span>💵 Partial &amp; Full Payments Received</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {activeStats.bills.length}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {singleDetailTab === "REQUISITIONS" ? (
                      <span className="text-xs text-gray-600">
                        Total Spend:{" "}
                        <strong className="font-mono text-gray-900">
                          Tk {formatBDT(activeStats.totalSpend)}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">
                        Received:{" "}
                        <strong className="font-mono text-emerald-800">
                          Tk {formatBDT(activeStats.receivedAmount)}
                        </strong>
                        {" · "}
                        Due:{" "}
                        <strong className="font-mono text-amber-800">
                          Tk {formatBDT(activeStats.remainingDue)}
                        </strong>
                      </span>
                    )}
                    {canEditFinance && (
                      <button
                        type="button"
                        onClick={() => openPaymentModal()}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 shrink-0 cursor-pointer"
                      >
                        + Add Payment
                      </button>
                    )}
                  </div>
                </div>

                {singleDetailTab === "REQUISITIONS" && (
                  <>
                  <div className="px-5 py-2.5 bg-gray-50/40 border-b border-gray-100 text-[11px] text-gray-500">
                    Requisitions of <strong className="text-gray-800">{selectedProject.name}</strong> ({activeStats.reqs.length}) — Click ▼ to expand line items or click a Voucher # to open details.
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
                                  <td className="py-3 px-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                                    {formatBDT(r.total)}
                                  </td>
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedReqId(
                                          isExpanded ? null : r.id
                                        )
                                      }
                                      className="px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 cursor-pointer"
                                    >
                                      {isExpanded
                                        ? "▲ Hide"
                                        : `▼ ${r.items?.length || 0} Items`}
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
                  </>
                )}

                {singleDetailTab === "PAYMENTS" && (
                  <>
                  <div className="px-5 py-2.5 bg-emerald-50/40 border-b border-emerald-100 text-[11px] text-gray-600">
                    Derived maturity status with ±10 BDT tolerance. Each installment reduces Remaining Due.
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
                                  <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                    <span>{b.billNumber || "—"}</span>
                                    {b.isOpeningBalance && (
                                      <span
                                        className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold"
                                        title="Opening Balance Bill — Receivables Only, excluded from current P&L"
                                      >
                                        OPENING BAL
                                      </span>
                                    )}
                                  </div>
                                  {b.notes && (
                                    <div className="text-[10px] text-gray-500 truncate max-w-[160px]">
                                      {b.notes}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
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
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                                  Tk {formatBDT(b.receivedAmount)}
                                </td>
                                {canEditFinance && (
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        title="Edit bill / payment"
                                        onClick={() => openPaymentModal(b)}
                                        className="px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 cursor-pointer"
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete bill / payment"
                                        onClick={() => handleDeleteBill(b.id)}
                                        className="px-2.5 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-[11px] font-semibold text-red-700 cursor-pointer"
                                      >
                                        🗑️ Delete
                                      </button>
                                    </div>
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
                  </>
                )}
              </div>
            </>
          )}

          {/* STEP 5 (SHARED): COLLAPSIBLE VISUAL DATA ANALYSIS CHARTS */}
          {selectedProject && activeStats && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSingleCharts(!showSingleCharts)}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    📊 Visual Charts & Cost Head Breakdown —{" "}
                    {selectedProject.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold">
                    Monthly Analytics &amp; {costHeadPieData.length} Cost Heads
                  </span>
                </div>
                <span className="text-xs font-bold text-blue-700">
                  {showSingleCharts ? "▲ Hide Charts" : "▼ Show Visual Charts"}
                </span>
              </button>

              {showSingleCharts && (
                <div className="p-4 border-t border-gray-200 bg-gray-50/40 space-y-4">
                  {/* ROW 1: 2 WIDE CHARTS SIDE BY SIDE (NO SQUISHED TOOTHPICK BARS) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Chart 1: Monthly Spend, Expected Inflow & Cash Received */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <h4 className="text-xs font-bold text-gray-900">
                            {selectedProject.kind === "COMPANY"
                              ? "📈 Monthly Overhead Spend Trend"
                              : "📈 Monthly Spend vs. Client Inflow & Collection"}
                          </h4>
                          <p className="text-[11px] text-gray-500">
                            {selectedProject.kind === "COMPANY"
                              ? "Monthly internal requisition spend"
                              : "Comparing Cost, Expected Inflow (−AIT), and Actual Cash Received"}
                          </p>
                        </div>
                      </div>

                      {monthlyChartData.length === 0 ? (
                        <div className="h-52 flex items-center justify-center text-xs text-gray-400">
                          No monthly data yet.
                        </div>
                      ) : (
                        <div className="h-52 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={monthlyChartData}
                              margin={{ top: 6, right: 10, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="shortMonth" tick={{ fontSize: 10 }} />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                width={46}
                                tickFormatter={(v) =>
                                  v >= 100000
                                    ? `${(v / 100000).toFixed(0)}L`
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
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar
                                dataKey="totalCost"
                                name={
                                  selectedProject.kind === "COMPANY"
                                    ? "Overhead Spend"
                                    : "Total Cost"
                                }
                                fill={
                                  selectedProject.kind === "COMPANY"
                                    ? "#be123c"
                                    : "#475569"
                                }
                                radius={[3, 3, 0, 0]}
                              />
                              {selectedProject.kind !== "COMPANY" && (
                                <>
                                  <Bar
                                    dataKey="expectedInflow"
                                    name="Expected Inflow"
                                    fill="#4f46e5"
                                    radius={[3, 3, 0, 0]}
                                  />
                                  <Bar
                                    dataKey="receivedAmount"
                                    name="Cash Received"
                                    fill="#059669"
                                    radius={[3, 3, 0, 0]}
                                  />
                                </>
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Chart 2: Dedicated Net Profit Trend (Own Scale!) OR Overhead by Voucher */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      {selectedProject.kind !== "COMPANY" ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                            <div>
                              <h4 className="text-xs font-bold text-gray-900">
                                💹 Monthly Net Profit Trend (Tk)
                              </h4>
                              <p className="text-[11px] text-gray-500">
                                Dedicated profit scale after AIT &amp; IMS investments
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold font-mono">
                              Avg: Tk{" "}
                              {formatCompactBDT(
                                monthlyChartData.length > 0
                                  ? monthlyChartData.reduce(
                                      (s, m) => s + m.accruedProfit,
                                      0
                                    ) / monthlyChartData.length
                                  : 0
                              )}
                              /mo
                            </span>
                          </div>

                          {monthlyChartData.length === 0 ? (
                            <div className="h-52 flex items-center justify-center text-xs text-gray-400">
                              No monthly profit data yet.
                            </div>
                          ) : (
                            <div className="h-52 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                  data={monthlyChartData}
                                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                                >
                                  <defs>
                                    <linearGradient
                                      id="profitAreaGrad"
                                      x1="0"
                                      y1="0"
                                      x2="0"
                                      y2="1"
                                    >
                                      <stop
                                        offset="5%"
                                        stopColor="#10b981"
                                        stopOpacity={0.35}
                                      />
                                      <stop
                                        offset="95%"
                                        stopColor="#10b981"
                                        stopOpacity={0.03}
                                      />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                  <XAxis dataKey="shortMonth" tick={{ fontSize: 10 }} />
                                  <YAxis
                                    tick={{ fontSize: 10 }}
                                    width={46}
                                    tickFormatter={(v) =>
                                      Math.abs(v) >= 100000
                                        ? `${(v / 100000).toFixed(1)}L`
                                        : Math.abs(v) >= 1000
                                        ? `${(v / 1000).toFixed(0)}k`
                                        : String(v)
                                    }
                                  />
                                  <Tooltip
                                    formatter={(val: any) => [
                                      `Tk ${formatBDT(Number(val || 0))}`,
                                      "Net Profit",
                                    ]}
                                  />
                                  <Area
                                    type="monotone"
                                    dataKey="accruedProfit"
                                    name="Net Profit"
                                    stroke="#059669"
                                    strokeWidth={2.5}
                                    fill="url(#profitAreaGrad)"
                                    dot={{ r: 3.5, fill: "#059669" }}
                                    activeDot={{ r: 5 }}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h4 className="text-xs font-bold text-gray-900">
                              📊 Requisitions Spend ({reqBarData.length})
                            </h4>
                            <p className="text-[11px] text-gray-500">
                              Individual requisition voucher amounts
                            </p>
                          </div>
                          {reqBarData.length === 0 ? (
                            <div className="h-52 flex items-center justify-center text-xs text-gray-400">
                              No requisitions yet.
                            </div>
                          ) : (
                            <div className="h-52 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={reqBarData}
                                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                  <YAxis
                                    tick={{ fontSize: 10 }}
                                    width={46}
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
                                  <Bar
                                    dataKey="Total"
                                    name="Overhead Amount"
                                    fill="#be123c"
                                    radius={[3, 3, 0, 0]}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* ROW 2: FULL-WIDTH COST HEAD BREAKDOWN (FULL UNTRUNCATED NAMES + % SHARE BARS) */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-100">
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">
                          🍩 Cost Head Breakdown ({costHeadPieData.length} Cost Heads)
                        </h4>
                        <p className="text-[11px] text-gray-500">
                          Full breakdown by category with exact Taka totals and % share of spend
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-gray-600">
                        Total Spend:{" "}
                        <strong className="font-mono text-gray-900">
                          Tk{" "}
                          {formatBDT(
                            costHeadPieData.reduce((s, d) => s + d.value, 0)
                          )}
                        </strong>
                      </span>
                    </div>

                    {costHeadPieData.length === 0 ? (
                      <div className="h-32 flex items-center justify-center text-xs text-gray-400">
                        No line items yet.
                      </div>
                    ) : (
                      (() => {
                        const grandHeadSum = costHeadPieData.reduce(
                          (s, d) => s + d.value,
                          0
                        );
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                            <div className="md:col-span-4 h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={costHeadPieData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={38}
                                    outerRadius={72}
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

                            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                              {costHeadPieData.map((d, idx) => {
                                const pct =
                                  grandHeadSum > 0
                                    ? (d.value / grandHeadSum) * 100
                                    : 0;
                                const color =
                                  PIE_COLORS[idx % PIE_COLORS.length];
                                return (
                                  <div key={d.name} className="space-y-1">
                                    <div className="flex items-baseline justify-between gap-2 text-xs">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: color }}
                                        />
                                        <span
                                          className="font-semibold text-gray-800 truncate"
                                          title={d.name}
                                        >
                                          {d.name}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold text-gray-900 shrink-0 text-[11px]">
                                        Tk {formatBDT(d.value)}{" "}
                                        <span className="text-gray-400 font-normal">
                                          ({pct.toFixed(1)}%)
                                        </span>
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: `${Math.max(2, pct)}%`,
                                          backgroundColor: color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <PaymentBillModal
        open={modalOpen}
        project={modalProject || selectedProject}
        editingBillId={editingBillId}
        formMonth={formMonth}
        setFormMonth={setFormMonth}
        formStatus={formStatus}
        setFormStatus={setFormStatus}
        formBillNo={formBillNo}
        setFormBillNo={setFormBillNo}
        formPoNo={formPoNo}
        setFormPoNo={setFormPoNo}
        formSubmittedAt={formSubmittedAt}
        setFormSubmittedAt={setFormSubmittedAt}
        formDueDate={formDueDate}
        setFormDueDate={setFormDueDate}
        formBillableCost={formBillableCost}
        formImsInv={formImsInv}
        formBillExVat={formBillExVat}
        setFormBillExVat={setFormBillExVat}
        formVatAmt={formVatAmt}
        setFormVatAmt={setFormVatAmt}
        formAitAmt={formAitAmt}
        setFormAitAmt={setFormAitAmt}
        formReceivedAmt={formReceivedAmt}
        setFormReceivedAmt={setFormReceivedAmt}
        formReceivedAt={formReceivedAt}
        setFormReceivedAt={setFormReceivedAt}
        formNotes={formNotes}
        setFormNotes={setFormNotes}
        formIsOpeningBalance={formIsOpeningBalance}
        setFormIsOpeningBalance={setFormIsOpeningBalance}
        liveBillWithVat={liveBillWithVat}
        liveExpectedInflow={liveExpectedInflow}
        liveDeviation={liveDeviation}
        saving={saving}
        computeDueDateStr={computeDueDateStr}
        onAutoRecalculate={handleAutoRecalculate}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSaveBill}
      />

      <MonthCloseModal
        open={closeMonthModalOpen}
        project={selectedProject}
        mode={closeMonthMode}
        targetMonth={closeMonthTarget}
        reason={closeMonthReason}
        saving={saving}
        setTargetMonth={setCloseMonthTarget}
        setMode={setCloseMonthMode}
        setReason={setCloseMonthReason}
        onClose={() => setCloseMonthModalOpen(false)}
        onSubmit={handleMonthCloseOrReopen}
      />

      <ForecastOverrideModal
        open={forecastModalOpen}
        project={forecastTargetProject}
        targetMonth={forecastTargetMonth}
        amountStr={forecastAmountStr}
        noteStr={forecastNoteStr}
        saving={saving}
        setAmountStr={setForecastAmountStr}
        setNoteStr={setForecastNoteStr}
        onClose={() => setForecastModalOpen(false)}
        onSave={handleSaveManualForecast}
      />

    </div>
  );
}
