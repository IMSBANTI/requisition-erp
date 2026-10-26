"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateProfitSummary } from "@/lib/profitEngine";

function formatBDT(n: number) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
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

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  UNBILLED: {
    label: "Unbilled",
    cls: "bg-gray-100 text-gray-700 border-gray-200",
  },
  SUBMITTED: {
    label: "Bill Submitted",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  PARTIAL_PAID: {
    label: "Partial Payment",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
  },
  PAID: {
    label: "Full / Final Payment",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
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

export default function FinanceClient({
  projects,
  canEditFinance,
}: {
  projects: ProjectFinanceItem[];
  canEditFinance: boolean;
}) {
  const router = useRouter();

  // Strictly separate Projects vs Events
  const permanentProjects = useMemo(
    () => projects.filter((p) => p.kind === "PERMANENT"),
    [projects]
  );
  const eventProjects = useMemo(
    () => projects.filter((p) => p.kind === "EVENT"),
    [projects]
  );

  const [activeType, setActiveType] = useState<"PERMANENT" | "EVENT">("PERMANENT");

  // Pick default project/event (prefer first one with requisitions or payments)
  const currentList = activeType === "PERMANENT" ? permanentProjects : eventProjects;

  const [selectedId, setSelectedId] = useState<string>(() => {
    const firstActive =
      permanentProjects.find((p) => p.reqCount > 0 || p.bills.length > 0) ||
      permanentProjects[0];
    return firstActive ? firstActive.id : "";
  });

  // When switching between Projects and Events, select the first item in that list
  useEffect(() => {
    const list = activeType === "PERMANENT" ? permanentProjects : eventProjects;
    if (!list.some((p) => p.id === selectedId)) {
      const firstActive =
        list.find((p) => p.reqCount > 0 || p.bills.length > 0) || list[0];
      setSelectedId(firstActive ? firstActive.id : "");
    }
  }, [activeType, permanentProjects, eventProjects, selectedId]);

  const selectedProject = useMemo(
    () => currentList.find((p) => p.id === selectedId) || currentList[0] || null,
    [currentList, selectedId]
  );

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);

  // Reset month filter when switching project
  useEffect(() => {
    setSelectedMonth("ALL");
    setExpandedReqId(null);
  }, [selectedId]);

  // Modal state for Recording / Editing a Partial or Full Client Payment
  const [modalOpen, setModalOpen] = useState(false);
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

  // Available months for the selected project
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

  // Filtered Requisitions & Payments for the selected project and month
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
    const remainingDue = Math.max(0, expectedInflow - receivedAmount);
    const accruedProfit = expectedInflow - totalSpend;
    const realizedProfit = receivedAmount - totalSpend;
    const collectionPercent =
      expectedInflow > 0
        ? Math.min(100, Math.round((receivedAmount / expectedInflow) * 100))
        : 0;

    return {
      reqs,
      bills,
      billableSpend,
      imsSpend,
      totalSpend,
      calc,
      billedExVat,
      billedWithVat,
      expectedInflow,
      receivedAmount,
      remainingDue,
      accruedProfit,
      realizedProfit,
      collectionPercent,
    };
  }, [selectedProject, selectedMonth]);

  // 1. Monthly Chart Data for Selected Project
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
        const c = calculateProfitSummary({
          terms: selectedProject.terms,
          billableCost: row.billableCost,
          imsInvestment: row.imsInvestment,
        });
        return {
          ...row,
          expectedInflow: Math.round(c.expectedInflow),
          accruedProfit: Math.round(c.expectedInflow - row.totalCost),
        };
      });
  }, [selectedProject]);

  // 2. Cost Head Breakdown Pie Data for Selected Project
  const costHeadPieData = useMemo(() => {
    if (!activeStats) return [];
    const map: Record<string, number> = {};
    for (const r of activeStats.reqs) {
      if (r.items && r.items.length > 0) {
        for (const it of r.items) {
          const head = it.costHead || "General Expense";
          map[head] = (map[head] || 0) + it.amount;
        }
      } else {
        if (r.billableCost > 0) {
          map["Billable Requisition Spend"] =
            (map["Billable Requisition Spend"] || 0) + r.billableCost;
        }
        if (r.imsInvestment > 0) {
          map["IMS Own Investment"] =
            (map["IMS Own Investment"] || 0) + r.imsInvestment;
        }
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

  function openPaymentModal(existingBill?: ClientBillItem) {
    if (!selectedProject || !activeStats) return;

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
          : selectedProject.kind === "EVENT"
          ? "EVENT-TOTAL"
          : new Date().toISOString().slice(0, 7);
      setFormMonth(m);
      setFormBillNo("");
      setFormPoNo("");
      setFormStatus("PARTIAL_PAID");
      setFormBillableCost(String(activeStats.billableSpend.toFixed(2)));
      setFormImsInv(String(activeStats.imsSpend.toFixed(2)));
      setFormBillExVat(String(activeStats.calc.billExVat.toFixed(2)));
      setFormVatAmt(String(activeStats.calc.vatAmount.toFixed(2)));
      setFormAitAmt(String(activeStats.calc.aitDeducted.toFixed(2)));
      setFormReceivedAmt("");
      setFormSubmittedAt(new Date().toISOString().slice(0, 10));
      setFormDueDate("");
      setFormReceivedAt(new Date().toISOString().slice(0, 10));
      setFormDeviation("");
      setFormNotes(
        `Installment #${activeStats.bills.length + 1} for ${selectedProject.name}`
      );
    }
    setModalOpen(true);
  }

  function handleAutoRecalculate(newBillableStr: string, newImsStr: string) {
    setFormBillableCost(newBillableStr);
    setFormImsInv(newImsStr);
    if (!selectedProject) return;
    const c = calculateProfitSummary({
      terms: selectedProject.terms,
      billableCost: Number(newBillableStr || 0),
      imsInvestment: Number(newImsStr || 0),
    });
    setFormBillExVat(String(c.billExVat.toFixed(2)));
    setFormVatAmt(String(c.vatAmount.toFixed(2)));
    setFormAitAmt(String(c.aitDeducted.toFixed(2)));
  }

  async function handleSaveBill(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingBillId || undefined,
          projectId: selectedProject.id,
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

  const liveBillWithVat =
    Number(formBillExVat || 0) + Number(formVatAmt || 0);
  const liveExpectedInflow =
    liveBillWithVat - Number(formAitAmt || 0);

  return (
    <div className="mt-5 space-y-6">
      {/* STEP 1: CLEAN SELECTOR BAR (PROJECTS vs EVENTS + DROPDOWN LIST) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 1A. Toggle between Projects and Events */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setActiveType("PERMANENT")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
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
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeType === "EVENT"
                    ? "bg-purple-700 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                🎪 Events ({eventProjects.length})
              </button>
            </div>

            {/* 1B. Primary Dropdown Selector for Project or Event */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px] sm:min-w-[360px]">
              <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                {activeType === "PERMANENT"
                  ? "Select Project:"
                  : "Select Event:"}
              </label>
              <select
                value={selectedProject?.id || ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 shadow-sm focus:border-blue-600 focus:outline-none"
              >
                {currentList.length === 0 ? (
                  <option value="">
                    No {activeType === "PERMANENT" ? "Projects" : "Events"} Found
                  </option>
                ) : (
                  currentList.map((p) => {
                    const totalSpend = p.totalBillableReq + p.totalImsInvReq;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}) — {p.reqCount} Req(s)
                        {totalSpend > 0 ? ` • Tk ${formatBDT(totalSpend)}` : ""}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          </div>

          {/* 1C. Period Filter & Add Payment Button */}
          {selectedProject && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500">
                  Period:
                </span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm"
                >
                  <option value="ALL">All Months (Cumulative)</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {canEditFinance && (
                <button
                  type="button"
                  onClick={() => openPaymentModal()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  💰 + Add Partial / Full Payment
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* IF NO PROJECT OR EVENT EXISTS IN THIS TAB */}
      {!selectedProject || !activeStats ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <div className="text-base font-bold text-gray-800">
            No {activeType === "PERMANENT" ? "Projects" : "Events"} Available
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Create {activeType === "PERMANENT" ? "a Project" : "an Event"} in{" "}
            <Link href="/admin/projects" className="text-blue-600 underline font-semibold">
              Projects & Events Setup
            </Link>{" "}
            to track its Requisitions, Client Bills, and Profit/Loss.
          </p>
        </div>
      ) : (
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
                    {selectedProject.kind === "EVENT" ? "🎪 EVENT" : "📁 PROJECT"}
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
                Across <strong>{activeStats.reqs.length}</strong> Requisition(s)
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
                    📋 Requisitions of {selectedProject.name} ({activeStats.reqs.length})
                  </h3>
                  <p className="text-xs text-gray-500">
                    Every requisition adds to total project spend. Click a row to view its line items.
                  </p>
                </div>
              </div>

              {activeStats.reqs.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  No requisitions created for <strong>{selectedProject.name}</strong> in this period.
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
                                    setExpandedReqId(isExpanded ? null : r.id)
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
                                                  it.costTag === "IMS_INVESTMENT"
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
                    💵 Partial & Full Payments Received ({activeStats.bills.length})
                  </h3>
                  <p className="text-xs text-gray-500">
                    Each partial payment installment adds to Total Received and reduces Remaining Due.
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
                        <th className="py-2.5 px-3">Status & Date</th>
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
                        const badge =
                          STATUS_BADGES[b.status] || STATUS_BADGES.UNBILLED;
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
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {b.receivedAt || b.submittedAt || "—"}
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
                          Total Received ({activeStats.bills.length} Installment
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

          {/* STEP 5: COMPACT VISUAL DATA ANALYSIS CHARTS BELOW THE PAGE */}
          <div className="pt-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              📊 Visual Data Analysis — {selectedProject.name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Compact Chart 1: Monthly Spend vs Expected Inflow vs Received Payment */}
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-xs font-bold text-gray-900">
                    📈 Spend vs. Inflow & Profit
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Monthly Spend, Expected Inflow, Received & Profit
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
                          name="Cost"
                          fill="#4b5563"
                          radius={[3, 3, 0, 0]}
                        />
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
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Compact Chart 2: Cost Head Breakdown (Donut Chart) */}
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

              {/* Compact Chart 3: Individual Requisition Comparison Bar Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                <div className="mb-2">
                  <h4 className="text-xs font-bold text-gray-900">
                    📊 Requisitions Cost Split ({reqBarData.length})
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Billable vs. IMS Investment per requisition
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL: RECORD / UPDATE PARTIAL OR FULL PAYMENT */}
      {modalOpen && selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-200 my-8">
            <div className="flex items-start justify-between border-b border-gray-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {editingBillId
                    ? "✏️ Edit Payment / Client Bill Record"
                    : "💰 Record Partial or Full Client Payment"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedProject.kind === "EVENT" ? "🎪 Event: " : "📁 Project: "}
                  <strong>{selectedProject.name}</strong> ({selectedProject.code}) • Model:{" "}
                  <strong>
                    {BILLING_MODEL_LABELS[selectedProject.terms.billingProfile] ||
                      selectedProject.terms.billingProfile}
                  </strong>
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

            <form onSubmit={handleSaveBill} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Period / Service Month
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
                    <option value="PARTIAL_PAID">Partial Payment Received</option>
                    <option value="PAID">Full / Final Payment Received</option>
                    <option value="SUBMITTED">Bill Submitted (Unpaid)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Invoice / Cheque / Ref #
                  </label>
                  <input
                    type="text"
                    value={formBillNo}
                    onChange={(e) => setFormBillNo(e.target.value)}
                    placeholder="e.g. INV-2026-042"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
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
                        handleAutoRecalculate(formBillableCost, e.target.value)
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
                  Bill With VAT: <strong>Tk {formatBDT(liveBillWithVat)}</strong> • Expected Net Inflow (-AIT):{" "}
                  <strong>Tk {formatBDT(liveExpectedInflow)}</strong>
                </div>
              </div>

              {/* Partial / Full Payment Amount */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-3">
                <div className="font-bold text-emerald-950">
                  2. Payment Received in This Installment
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
                      placeholder="Enter installment amount received"
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
                    Installment Description / Bank Reference / Notes
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
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
