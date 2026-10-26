"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import { calculateProfitSummary } from "@/lib/profitEngine";

interface Props {
  project: {
    id: string;
    code: string;
    name: string;
    companyName: string;
    kind: "PERMANENT" | "EVENT";
    category: string;
    headName: string;
    checkerName: string;
    directorName: string;
    budget: number;
    terms: any;
  };
  requisitions: any[];
  payments: any[];
  canEditFinance: boolean;
}

const CHART_COLORS = [
  "#E42528",
  "#2563EB",
  "#059669",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#4B5563",
];

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ProjectFinanceDetailClient({
  project,
  requisitions,
  payments,
  canEditFinance,
}: Props) {
  const router = useRouter();
  const isEvent = project.kind === "EVENT";

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [expandedReqIds, setExpandedReqIds] = useState<Record<string, boolean>>({});

  // Partial / Full Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [payMonth, setPayMonth] = useState<string>(getCurrentYearMonth());
  const [payBillNo, setPayBillNo] = useState<string>("");
  const [payPoNo, setPayPoNo] = useState<string>("");
  const [payStatus, setPayStatus] = useState<string>("PARTIAL_PAID");
  const [payReceivedAmt, setPayReceivedAmt] = useState<string>("0");
  const [paySubmittedAt, setPaySubmittedAt] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [payReceivedAt, setPayReceivedAt] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [payNotes, setPayNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Collect all unique months
  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    s.add(getCurrentYearMonth());
    for (const r of requisitions) {
      if (r.forMonth) s.add(r.forMonth);
    }
    for (const p of payments) {
      if (p.forMonth && p.forMonth !== "EVENT") s.add(p.forMonth);
    }
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [requisitions, payments]);

  // Filtered Requisitions and Partial Payments for selected period
  const filteredReqs = useMemo(
    () =>
      selectedMonth === "ALL"
        ? requisitions
        : requisitions.filter((r) => r.forMonth === selectedMonth),
    [requisitions, selectedMonth]
  );

  const filteredPayments = useMemo(
    () =>
      selectedMonth === "ALL"
        ? payments
        : payments.filter((p) => p.forMonth === selectedMonth),
    [payments, selectedMonth]
  );

  // Aggregate Requisition Costs & Partial Payments
  const summary = useMemo(() => {
    const totalBillable = filteredReqs.reduce((s, r) => s + r.billableCost, 0);
    const totalImsInv = filteredReqs.reduce((s, r) => s + r.imsInvestment, 0);

    const calc = calculateProfitSummary({
      terms: project.terms,
      billableCost: totalBillable,
      imsInvestment: totalImsInv,
    });

    const totalCostSpent =
      calc.billableCost +
      calc.imsInvestment +
      (calc.maintenanceCost || 0) +
      (calc.amortizationCost || 0);

    // Sum all partial/full payments received in this period
    const totalReceived = filteredPayments.reduce(
      (s, p) => s + p.receivedAmount,
      0
    );

    const expectedInflow = calc.expectedInflow;
    const remainingDue = Math.max(0, expectedInflow - totalReceived);
    const collectionPct =
      expectedInflow > 0
        ? Math.min(100, Number(((totalReceived / expectedInflow) * 100).toFixed(1)))
        : 0;

    const accruedNetProfit = expectedInflow - totalCostSpent;
    const realizedCashProfit = totalReceived - totalCostSpent;
    const netMarginPct =
      calc.billExVat > 0
        ? Number(((accruedNetProfit / calc.billExVat) * 100).toFixed(1))
        : 0;

    return {
      ...calc,
      totalCostSpent,
      totalReceived,
      remainingDue,
      collectionPct,
      accruedNetProfit,
      realizedCashProfit,
      netMarginPct,
      reqCount: filteredReqs.length,
      paymentCount: filteredPayments.length,
    };
  }, [filteredReqs, filteredPayments, project.terms]);

  // Chart 1 Data: Monthly Financial Trend (Cost vs Expected Inflow vs Payment Received vs Net Profit)
  const monthlyChartData = useMemo(() => {
    const map: Record<
      string,
      {
        month: string;
        billableCost: number;
        imsInvestment: number;
        totalCost: number;
        expectedInflow: number;
        receivedAmount: number;
        accruedProfit: number;
      }
    > = {};

    for (const r of requisitions) {
      const m = r.forMonth || "Other";
      if (!map[m]) {
        map[m] = {
          month: m,
          billableCost: 0,
          imsInvestment: 0,
          totalCost: 0,
          expectedInflow: 0,
          receivedAmount: 0,
          accruedProfit: 0,
        };
      }
      map[m].billableCost += r.billableCost;
      map[m].imsInvestment += r.imsInvestment;
      map[m].totalCost += r.total;
    }

    for (const p of payments) {
      const m = p.forMonth || "Other";
      if (!map[m]) {
        map[m] = {
          month: m,
          billableCost: 0,
          imsInvestment: 0,
          totalCost: 0,
          expectedInflow: 0,
          receivedAmount: 0,
          accruedProfit: 0,
        };
      }
      map[m].receivedAmount += p.receivedAmount;
    }

    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => {
        const c = calculateProfitSummary({
          terms: project.terms,
          billableCost: row.billableCost,
          imsInvestment: row.imsInvestment,
        });
        return {
          ...row,
          expectedInflow: c.expectedInflow,
          accruedProfit: c.netProfit,
        };
      });
  }, [requisitions, payments, project.terms]);

  // Chart 2 Data: Cost Head Breakdown across all requisitions in period
  const costHeadChartData = useMemo(() => {
    const map: Record<string, { name: string; value: number; tag: string }> = {};
    for (const r of filteredReqs) {
      for (const it of r.items || []) {
        const key = it.costHead || it.particulars || "General Expense";
        if (!map[key]) {
          map[key] = { name: key, value: 0, tag: it.costTag || "BILLABLE" };
        }
        map[key].value += Number(it.amount || 0);
      }
    }
    return Object.values(map)
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredReqs]);

  // Chart 3 Data: Requisition-by-Requisition Cost Comparison
  const reqBarChartData = useMemo(() => {
    return [...filteredReqs]
      .reverse()
      .map((r) => ({
        name: r.number || r.date,
        Billable: r.billableCost,
        "IMS Investment": r.imsInvestment,
        Total: r.total,
      }));
  }, [filteredReqs]);

  function openAddPartialPaymentModal(existing?: any) {
    setModalError("");
    if (existing) {
      setEditPayId(existing.id);
      setPayMonth(existing.forMonth || getCurrentYearMonth());
      setPayBillNo(existing.billNumber || "");
      setPayPoNo(existing.poNumber || "");
      setPayStatus(existing.status || "PARTIAL_PAID");
      setPayReceivedAmt(String(existing.receivedAmount || 0));
      setPaySubmittedAt(
        existing.submittedAt || new Date().toISOString().slice(0, 10)
      );
      setPayReceivedAt(
        existing.receivedAt || new Date().toISOString().slice(0, 10)
      );
      setPayNotes(existing.deviationReason || existing.notes || "");
    } else {
      setEditPayId(null);
      const m = selectedMonth !== "ALL" ? selectedMonth : getCurrentYearMonth();
      setPayMonth(m);
      const partIndex = filteredPayments.length + 1;
      setPayBillNo(`${m.replace("-", "/")}/${project.code}-P${partIndex}`);
      setPayPoNo("");
      setPayStatus("PARTIAL_PAID");
      setPayReceivedAmt(String(summary.remainingDue > 0 ? summary.remainingDue : 0));
      setPaySubmittedAt(new Date().toISOString().slice(0, 10));
      setPayReceivedAt(new Date().toISOString().slice(0, 10));
      setPayNotes(`Installment / Partial Payment #${partIndex}`);
    }
    setShowPayModal(true);
  }

  async function handleSavePartialPayment(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editPayId,
          projectId: project.id,
          forMonth: payMonth,
          billNumber: payBillNo,
          poNumber: payPoNo,
          status: payStatus,
          billableCost: summary.billableCost,
          imsInvestment: summary.imsInvestment,
          receivedAmount: parseFloat(payReceivedAmt) || 0,
          submittedAt: paySubmittedAt || null,
          receivedAt: payReceivedAt || null,
          deviationReason: payNotes,
          notes: payNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save payment");
      setShowPayModal(false);
      setSaving(false);
      router.refresh();
    } catch (err: any) {
      setModalError(err.message || "Error saving payment");
      setSaving(false);
    }
  }

  async function handleDeletePayment(id: string) {
    if (!window.confirm("Remove this payment installment record?")) return;
    try {
      const res = await fetch(`/api/finance/bills?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } catch (_) {}
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link
              href="/finance"
              className="text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              &larr; All Projects & Events P&L
            </Link>
            <span className="text-gray-300">/</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                isEvent ? "bg-blue-600" : "bg-gray-900"
              }`}
            >
              {isEvent ? "🎪 Event Financial Analytics" : "📁 Project Financial Analytics"}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight mt-1">
            {project.name} ({project.code})
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Company: <strong>{project.companyName}</strong> &bull; Head:{" "}
            <strong>{project.headName}</strong> &bull; Director:{" "}
            <strong>{project.directorName}</strong> &bull; Billing Profile:{" "}
            <strong>{summary.billingProfile}</strong> (Fee: {summary.feeRatePct}%, AIT:{" "}
            {summary.aitRatePct}%, VAT: {summary.vatRatePct}%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
          >
            <option value="ALL">All Periods ({requisitions.length} Requisitions)</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                Service Month: {m}
              </option>
            ))}
          </select>

          {canEditFinance && (
            <button
              type="button"
              onClick={() => openAddPartialPaymentModal()}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs cursor-pointer"
            >
              💰 + Add Partial / Full Payment
            </button>
          )}
        </div>
      </div>

      {/* 6 Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-500 uppercase block">
            1. Total Requisition Cost ({summary.reqCount} Reqs)
          </span>
          <span className="text-sm font-mono font-extrabold text-gray-900 mt-1 block">
            Tk {formatTaka(summary.totalCostSpent)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Billable: {formatTaka(summary.billableCost)} • IMS: {formatTaka(summary.imsInvestment)}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs">
          <span className="text-[10px] font-bold text-blue-800 uppercase block">
            2. Client Bill (With 15% VAT)
          </span>
          <span className="text-sm font-mono font-extrabold text-blue-900 mt-1 block">
            Tk {formatTaka(summary.billWithVat)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Ex-VAT: Tk {formatTaka(summary.billExVat)}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
          <span className="text-[10px] font-bold text-indigo-800 uppercase block">
            3. Expected Inflow (-AIT)
          </span>
          <span className="text-sm font-mono font-extrabold text-indigo-900 mt-1 block">
            Tk {formatTaka(summary.expectedInflow)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            AIT Deducted: -Tk {formatTaka(summary.aitDeducted)}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-800 uppercase block">
            4. Received ({summary.paymentCount} Installments)
          </span>
          <span className="text-sm font-mono font-extrabold text-emerald-700 mt-1 block">
            Tk {formatTaka(summary.totalReceived)}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
            Remaining Due: Tk {formatTaka(summary.remainingDue)} ({summary.collectionPct}%)
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border shadow-2xs ${
            summary.accruedNetProfit >= 0
              ? "bg-emerald-50/70 border-emerald-300"
              : "bg-red-50/70 border-red-300"
          }`}
        >
          <span className="text-[10px] font-bold text-gray-700 uppercase block">
            5. Accrued Profit / Loss
          </span>
          <span
            className={`text-sm font-mono font-extrabold mt-1 block ${
              summary.accruedNetProfit >= 0 ? "text-emerald-800" : "text-red-700"
            }`}
          >
            {summary.accruedNetProfit >= 0 ? "PROFIT +" : "LOSS "}Tk{" "}
            {formatTaka(summary.accruedNetProfit)}
          </span>
          <span className="text-[10px] font-semibold text-gray-600 block mt-0.5">
            Net Margin: {summary.netMarginPct}%
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border shadow-2xs ${
            summary.realizedCashProfit >= 0
              ? "bg-emerald-100/60 border-emerald-400"
              : "bg-amber-50/80 border-amber-300"
          }`}
        >
          <span className="text-[10px] font-bold text-gray-800 uppercase block">
            6. Realized Cash P&L
          </span>
          <span
            className={`text-sm font-mono font-extrabold mt-1 block ${
              summary.realizedCashProfit >= 0 ? "text-emerald-900" : "text-amber-900"
            }`}
          >
            {summary.realizedCashProfit >= 0 ? "PROFIT +" : "LOSS "}Tk{" "}
            {formatTaka(summary.realizedCashProfit)}
          </span>
          <span className="text-[10px] font-semibold text-gray-600 block mt-0.5">
            Received − Total Requisition Cost
          </span>
        </div>
      </div>

      {/* Partial Payment Collection Progress Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between text-xs mb-1.5">
          <span className="font-bold text-gray-800">
            Client Payment Collection Progress ({summary.paymentCount} Partial/Full Payment Installments)
          </span>
          <span className="font-mono font-bold text-gray-900">
            Collected Tk {formatTaka(summary.totalReceived)} of Tk{" "}
            {formatTaka(summary.expectedInflow)} Expected ({summary.collectionPct}%)
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className="h-full bg-emerald-600 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, summary.collectionPct))}%` }}
          />
        </div>
      </div>

      {/* Data Analysis Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly / Period Cost vs Expected Inflow vs Payment Received & Net Profit */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
            📊 Spend vs. Expected Inflow vs. Received Payment & Profit
          </h3>
          <p className="text-[11px] text-gray-500 mb-3">
            Comparison of Total Requisition Spend, Expected Client Inflow (-AIT), Actual Payment Received, and Net Profit.
          </p>
          <div className="h-64 w-full">
            {monthlyChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                No requisition or billing data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: any) => [`Tk ${formatTaka(Number(value || 0))}`, ""]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="totalCost" name="Total Requisition Spend" fill="#E42528" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expectedInflow" name="Expected Inflow (-AIT)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="receivedAmount" name="Payment Received" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="accruedProfit" name="Accrued Net Profit" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Cost Head Distribution (Pie Chart + Breakdown) */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
            🍩 Cost Head Breakdown (Across All Requisitions)
          </h3>
          <p className="text-[11px] text-gray-500 mb-3">
            Distribution of requisition costs across configured Cost Heads (Billable vs. IMS Investment).
          </p>
          <div className="h-64 w-full flex flex-col sm:flex-row items-center">
            {costHeadChartData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-gray-400">
                No requisition line items yet.
              </div>
            ) : (
              <>
                <div className="w-full sm:w-1/2 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costHeadChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {costHeadChartData.map((_, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => `Tk ${formatTaka(Number(val || 0))}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/2 max-h-56 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {costHeadChartData.map((ch, idx) => (
                    <div
                      key={ch.name}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                          }}
                        />
                        <span className="truncate font-medium text-gray-800">
                          {ch.name}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-gray-900 shrink-0">
                        Tk {formatTaka(ch.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chart 3: Requisition-by-Requisition Cost Comparison Bar Chart */}
      {reqBarChartData.length > 1 && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
            📋 Multi-Requisition Cost Comparison ({reqBarChartData.length} Requisitions)
          </h3>
          <p className="text-[11px] text-gray-500 mb-3">
            Compares Billable Cost vs. IMS Investment across each individual requisition raised for this {isEvent ? "Event" : "Project"}.
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reqBarChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => [`Tk ${formatTaka(Number(value || 0))}`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Billable" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="IMS Investment" stackId="a" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section A: Partial Payments & Client Collections Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              💵 Partial Payments & Client Collections ({filteredPayments.length} Installments)
            </h3>
            <p className="text-[11px] text-gray-500">
              Each partial payment received from the client is logged below and automatically sums into Total Received (Tk {formatTaka(summary.totalReceived)}).
            </p>
          </div>
          {canEditFinance && (
            <button
              type="button"
              onClick={() => openAddPartialPaymentModal()}
              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer"
            >
              + Add Partial Payment / Installment
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4"># / Installment Bill No.</th>
                <th className="py-2.5 px-4">Service Month</th>
                <th className="py-2.5 px-4">Submitted / Received Date</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Partial / Full Amount Received (Tk)</th>
                <th className="py-2.5 px-4">Notes / Reference</th>
                {canEditFinance && <th className="py-2.5 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-400">
                    No client payments recorded yet. Click{" "}
                    <strong>&ldquo;+ Add Partial Payment / Installment&rdquo;</strong> when a payment is received.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay, idx) => (
                  <tr key={pay.id} className="hover:bg-gray-50/80">
                    <td className="py-2.5 px-4 font-mono font-bold text-gray-900">
                      #{filteredPayments.length - idx} &bull; {pay.billNumber || "Installment"}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-gray-700">{pay.forMonth}</td>
                    <td className="py-2.5 px-4 text-gray-600">
                      {pay.receivedAt ? (
                        <span className="font-semibold text-emerald-700">
                          Received: {pay.receivedAt}
                        </span>
                      ) : (
                        <span>Submitted: {pay.submittedAt || "—"}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {pay.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-extrabold text-emerald-700">
                      Tk {formatTaka(pay.receivedAmount)}
                    </td>
                    <td className="py-2.5 px-4 text-gray-600">
                      {pay.deviationReason || pay.notes || "—"}
                    </td>
                    {canEditFinance && (
                      <td className="py-2.5 px-4 text-center space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openAddPartialPaymentModal(pay)}
                          className="px-2 py-0.5 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(pay.id)}
                          className="px-2 py-0.5 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 cursor-pointer"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
              {filteredPayments.length > 0 && (
                <tr className="bg-emerald-50/60 font-bold border-t border-emerald-200">
                  <td colSpan={4} className="py-2.5 px-4 text-right uppercase text-emerald-900">
                    Total Payment Received ({filteredPayments.length} Installments)
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-sm text-emerald-800 font-extrabold">
                    Tk {formatTaka(summary.totalReceived)}
                  </td>
                  <td colSpan={2} className="py-2.5 px-4 text-xs text-amber-800">
                    Remaining Balance Due: <strong>Tk {formatTaka(summary.remainingDue)}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section B: All Individual Requisitions Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              📋 All Requisitions for {project.name} ({filteredReqs.length} Requisitions)
            </h3>
            <p className="text-[11px] text-gray-500">
              Every individual requisition raised for this {isEvent ? "Event" : "Project"}, showing its Billable Cost, IMS Investment, and expandable line items.
            </p>
          </div>
          <Link
            href="/requisitions/new"
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md"
          >
            + New Requisition
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">Voucher # / Date</th>
                <th className="py-2.5 px-4">Service Month</th>
                <th className="py-2.5 px-4">Requested By</th>
                <th className="py-2.5 px-4 text-right">Billable Cost</th>
                <th className="py-2.5 px-4 text-right">IMS Investment</th>
                <th className="py-2.5 px-4 text-right">Total Requisition</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReqs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    No requisitions found for this period.
                  </td>
                </tr>
              ) : (
                filteredReqs.map((r) => {
                  const isExpanded = !!expandedReqIds[r.id];
                  return (
                    <>
                      <tr key={r.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4">
                          <Link
                            href={`/requisitions/${r.id}`}
                            className="font-bold text-gray-900 hover:text-[#E42528]"
                          >
                            {r.number}
                          </Link>
                          <span className="block text-[10px] text-gray-400">{r.date}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-gray-700">
                          {r.forMonth}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900">{r.makerName}</span>
                          <span className="block text-[10px] text-gray-500">
                            {r.makerDesignation}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-green-800 font-semibold">
                          Tk {formatTaka(r.billableCost)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-800 font-semibold">
                          Tk {formatTaka(r.imsInvestment)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-gray-900">
                          Tk {formatTaka(r.total)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              STATUS_COLORS[r.status] || "bg-gray-100"
                            }`}
                          >
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReqIds((prev) => ({
                                ...prev,
                                [r.id]: !prev[r.id],
                              }))
                            }
                            className="px-2 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 cursor-pointer"
                          >
                            {isExpanded ? "▲ Hide Items" : `▼ ${r.items.length} Items`}
                          </button>
                          <Link
                            href={`/requisitions/${r.id}`}
                            className="font-bold text-[#E42528] hover:underline"
                          >
                            Voucher &rarr;
                          </Link>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${r.id}-items`} className="bg-gray-50/90">
                          <td colSpan={8} className="p-3">
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-100 text-[10px] uppercase text-gray-600 font-bold border-b border-gray-200">
                                    <th className="py-1.5 px-3">SL</th>
                                    <th className="py-1.5 px-3">Cost Head</th>
                                    <th className="py-1.5 px-3">Tag</th>
                                    <th className="py-1.5 px-3">Particulars & Purpose</th>
                                    <th className="py-1.5 px-3 text-right">Qty</th>
                                    <th className="py-1.5 px-3 text-right">Unit Price</th>
                                    <th className="py-1.5 px-3 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {r.items.map((it: any) => (
                                    <tr key={it.id}>
                                      <td className="py-1.5 px-3 font-mono">{it.sl}</td>
                                      <td className="py-1.5 px-3 font-semibold text-gray-800">
                                        {it.costHead || "—"}
                                      </td>
                                      <td className="py-1.5 px-3">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                            it.costTag === "IMS_INVESTMENT"
                                              ? "bg-amber-50 text-amber-800 border-amber-200"
                                              : "bg-green-50 text-green-800 border-green-200"
                                          }`}
                                        >
                                          {it.costTag}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-gray-700">
                                        {it.particulars}
                                        {it.purpose ? ` — ${it.purpose}` : ""}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono">
                                        {it.qty}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono">
                                        {formatTaka(it.unitPrice)}
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-mono font-bold">
                                        {formatTaka(it.amount)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
              {filteredReqs.length > 0 && (
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td colSpan={3} className="py-2.5 px-4 text-right uppercase">
                    Sum of All {filteredReqs.length} Requisitions
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-green-800">
                    Tk {formatTaka(summary.billableCost)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-amber-800">
                    Tk {formatTaka(summary.imsInvestment)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-sm text-[#E42528] font-extrabold">
                    Tk {formatTaka(summary.totalCostSpent)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Partial Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  💰 {editPayId ? "Edit Payment Installment" : "Add Partial / Full Payment Received"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {project.name} ({project.code}) &bull; Expected Inflow: Tk{" "}
                  {formatTaka(summary.expectedInflow)} &bull; Remaining Due: Tk{" "}
                  {formatTaka(summary.remainingDue)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="text-gray-400 hover:text-black font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSavePartialPayment} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Service Month
                  </label>
                  <input
                    type="month"
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Installment / Bill No.
                  </label>
                  <input
                    type="text"
                    value={payBillNo}
                    onChange={(e) => setPayBillNo(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-emerald-800">
                    💵 Partial / Full Amount Received (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payReceivedAmt}
                    onChange={(e) => setPayReceivedAmt(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border-2 border-emerald-400 rounded-md text-xs font-mono font-extrabold bg-emerald-50/40 text-emerald-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Payment Status
                  </label>
                  <select
                    value={payStatus}
                    onChange={(e) => setPayStatus(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  >
                    <option value="PARTIAL_PAID">Partial Payment (Installment)</option>
                    <option value="PAID">Full / Final Settlement</option>
                    <option value="BILL_SUBMITTED">Bill Submitted (0 Received)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Payment Received Date
                  </label>
                  <input
                    type="date"
                    value={payReceivedAt}
                    onChange={(e) => setPayReceivedAt(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    PO / Cheque / BEFTN Ref
                  </label>
                  <input
                    type="text"
                    value={payPoNo}
                    onChange={(e) => setPayPoNo(e.target.value)}
                    placeholder="Optional reference"
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Installment Note (e.g., &ldquo;1st Partial Payment 50%&rdquo; or &ldquo;2nd Installment&rdquo;)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow cursor-pointer"
                >
                  {saving ? "Saving..." : "✓ Save Payment Installment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
