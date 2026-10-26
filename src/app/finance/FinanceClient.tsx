"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatTaka } from "@/lib/money";
import { calculateProfitSummary } from "@/lib/profitEngine";

interface Props {
  projects: any[];
  canEditFinance: boolean;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinanceClient({ projects, canEditFinance }: Props) {
  const router = useRouter();

  // Strictly separate Projects P&L, Events P&L, and Client Bills Ledger
  const [activeTab, setActiveTab] = useState<"PROJECT_PNL" | "EVENT_PNL" | "BILLS_LEDGER">(
    "PROJECT_PNL"
  );
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Modal state for Recording / Updating a Client Bill & Payment Received
  const [showBillModal, setShowBillModal] = useState(false);
  const [editBillId, setEditBillId] = useState<string | null>(null);
  const [modalProjectId, setModalProjectId] = useState<string>(projects[0]?.id || "");
  const [modalForMonth, setModalForMonth] = useState<string>(getCurrentYearMonth());
  const [modalBillNo, setModalBillNo] = useState<string>("");
  const [modalPoNo, setModalPoNo] = useState<string>("");
  const [modalStatus, setModalStatus] = useState<string>("BILL_SUBMITTED");
  const [modalBillableCost, setModalBillableCost] = useState<string>("0");
  const [modalImsInvCost, setModalImsInvCost] = useState<string>("0");
  const [modalCustomBillExVat, setModalCustomBillExVat] = useState<string>("");
  const [modalReceivedAmount, setModalReceivedAmount] = useState<string>("0");
  const [modalSubmittedAt, setModalSubmittedAt] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [modalReceivedAt, setModalReceivedAt] = useState<string>("");
  const [modalDeviationReason, setModalDeviationReason] = useState<string>("");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const projectsOnly = useMemo(
    () => projects.filter((p) => p.kind !== "EVENT"),
    [projects]
  );
  const eventsOnly = useMemo(
    () => projects.filter((p) => p.kind === "EVENT"),
    [projects]
  );

  // Collect all unique service months across requisitions and bills
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(getCurrentYearMonth());
    for (const p of projects) {
      for (const m of p.monthlyBreakdown || []) {
        if (m.forMonth) set.add(m.forMonth);
      }
      for (const b of p.bills || []) {
        if (b.forMonth && b.forMonth !== "EVENT") set.add(b.forMonth);
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  // Compute P&L rows for the active list (Projects or Events)
  const activePnlRows = useMemo(() => {
    const baseList = activeTab === "EVENT_PNL" ? eventsOnly : projectsOnly;
    return baseList
      .filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase())
      )
      .map((p) => {
        let billableCost = p.totalBillableReq;
        let imsInvestment = p.totalImsInvReq;
        let reqCount = p.reqCount;

        if (activeTab === "PROJECT_PNL" && selectedMonth !== "ALL") {
          const mRow = (p.monthlyBreakdown || []).find(
            (m: any) => m.forMonth === selectedMonth
          );
          billableCost = mRow ? mRow.billableCost : 0;
          imsInvestment = mRow ? mRow.imsInvestment : 0;
          reqCount = mRow ? mRow.reqCount : 0;
        }

        // Check if there are recorded ClientBills for this Project/Event (& Month)
        const matchingBills = (p.bills || []).filter((b: any) =>
          activeTab === "PROJECT_PNL" && selectedMonth !== "ALL"
            ? b.forMonth === selectedMonth
            : true
        );

        const calc = calculateProfitSummary({
          terms: p.terms,
          billableCost,
          imsInvestment,
        });

        const billedExVat =
          matchingBills.length > 0
            ? matchingBills.reduce((s: number, b: any) => s + b.billExVat, 0)
            : calc.billExVat;
        const billedWithVat =
          matchingBills.length > 0
            ? matchingBills.reduce((s: number, b: any) => s + b.billWithVat, 0)
            : calc.billWithVat;
        const expectedInflow =
          matchingBills.length > 0
            ? matchingBills.reduce((s: number, b: any) => s + b.expectedInflow, 0)
            : calc.expectedInflow;
        const receivedAmount = matchingBills.reduce(
          (s: number, b: any) => s + b.receivedAmount,
          0
        );
        const outstandingAmount = Math.max(0, expectedInflow - receivedAmount);

        const totalCostSpent =
          billableCost +
          imsInvestment +
          (calc.maintenanceCost || 0) +
          (calc.amortizationCost || 0);

        const accruedNetProfit = expectedInflow - totalCostSpent;
        const realizedCashProfit = receivedAmount - totalCostSpent;
        const marginPct =
          billedExVat > 0 ? Number(((accruedNetProfit / billedExVat) * 100).toFixed(1)) : 0;

        return {
          ...p,
          activeBillableCost: billableCost,
          activeImsInvestment: imsInvestment,
          activeTotalCost: totalCostSpent,
          activeReqCount: reqCount,
          billedExVat,
          billedWithVat,
          expectedInflow,
          receivedAmount,
          outstandingAmount,
          accruedNetProfit,
          realizedCashProfit,
          marginPct,
          matchingBills,
        };
      });
  }, [activeTab, projectsOnly, eventsOnly, selectedMonth, search]);

  // Aggregate KPI Totals for top summary cards
  const kpiTotals = useMemo(() => {
    return activePnlRows.reduce(
      (acc, r) => {
        acc.billable += r.activeBillableCost;
        acc.imsInv += r.activeImsInvestment;
        acc.totalCost += r.activeTotalCost;
        acc.billedWithVat += r.billedWithVat;
        acc.expectedInflow += r.expectedInflow;
        acc.receivedAmount += r.receivedAmount;
        acc.outstanding += r.outstandingAmount;
        acc.accruedProfit += r.accruedNetProfit;
        acc.realizedProfit += r.realizedCashProfit;
        return acc;
      },
      {
        billable: 0,
        imsInv: 0,
        totalCost: 0,
        billedWithVat: 0,
        expectedInflow: 0,
        receivedAmount: 0,
        outstanding: 0,
        accruedProfit: 0,
        realizedProfit: 0,
      }
    );
  }, [activePnlRows]);

  // All Client Bills flattened for Ledger tab
  const allBillsList = useMemo(() => {
    const list: any[] = [];
    for (const p of projects) {
      for (const b of p.bills || []) {
        if (
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()) ||
          (b.billNumber || "").toLowerCase().includes(search.toLowerCase())
        ) {
          list.push(b);
        }
      }
    }
    return list;
  }, [projects, search]);

  // Open Modal to Record a New Bill / Payment for a specific Project or Event
  function openRecordPaymentModal(proj?: any, monthOverride?: string, existingBill?: any) {
    const targetProj = proj || projects[0];
    if (!targetProj) return;

    setModalError("");
    if (existingBill) {
      setEditBillId(existingBill.id);
      setModalProjectId(existingBill.projectId);
      setModalForMonth(existingBill.forMonth || getCurrentYearMonth());
      setModalBillNo(existingBill.billNumber || "");
      setModalPoNo(existingBill.poNumber || "");
      setModalStatus(existingBill.status || "BILL_SUBMITTED");
      setModalBillableCost(String(existingBill.billableCost || 0));
      setModalImsInvCost(String(existingBill.imsInvestment || 0));
      setModalCustomBillExVat("");
      setModalReceivedAmount(String(existingBill.receivedAmount || 0));
      setModalSubmittedAt(
        existingBill.submittedAt || new Date().toISOString().slice(0, 10)
      );
      setModalReceivedAt(existingBill.receivedAt || "");
      setModalDeviationReason(existingBill.deviationReason || "");
      setModalNotes(existingBill.notes || "");
    } else {
      setEditBillId(null);
      setModalProjectId(targetProj.id);
      const m =
        monthOverride && monthOverride !== "ALL"
          ? monthOverride
          : getCurrentYearMonth();
      setModalForMonth(m);
      setModalBillNo(`${m.replace("-", "/")}/${targetProj.code}`);
      setModalPoNo("");
      setModalStatus("PAID");

      // Pre-fill Billable & IMS Investment from requisitions
      const bCost =
        proj?.activeBillableCost !== undefined
          ? proj.activeBillableCost
          : targetProj.totalBillableReq || 0;
      const iCost =
        proj?.activeImsInvestment !== undefined
          ? proj.activeImsInvestment
          : targetProj.totalImsInvReq || 0;

      setModalBillableCost(String(bCost));
      setModalImsInvCost(String(iCost));
      setModalCustomBillExVat("");

      // Pre-calculate expected inflow so user can 1-click record full payment
      const preview = calculateProfitSummary({
        terms: targetProj.terms,
        billableCost: bCost,
        imsInvestment: iCost,
      });
      setModalReceivedAmount(String(preview.expectedInflow));
      setModalSubmittedAt(new Date().toISOString().slice(0, 10));
      setModalReceivedAt(new Date().toISOString().slice(0, 10));
      setModalDeviationReason("");
      setModalNotes("");
    }
    setShowBillModal(true);
  }

  const selectedModalProject = useMemo(
    () => projects.find((p) => p.id === modalProjectId) || projects[0],
    [projects, modalProjectId]
  );

  // Live P&L calculation inside the Modal
  const modalLiveCalc = useMemo(() => {
    if (!selectedModalProject) return null;
    const bCost = parseFloat(modalBillableCost) || 0;
    const iCost = parseFloat(modalImsInvCost) || 0;
    const customBill = parseFloat(modalCustomBillExVat) || 0;

    const calc = calculateProfitSummary({
      terms: {
        ...selectedModalProject.terms,
        ...(customBill > 0
          ? { billingProfile: "FIXED_QUOTE", fixedMonthlyBill: customBill }
          : {}),
      },
      billableCost: bCost,
      imsInvestment: iCost,
    });

    const recAmt = parseFloat(modalReceivedAmount) || 0;
    const totalCosts =
      calc.billableCost +
      calc.imsInvestment +
      calc.maintenanceCost +
      calc.amortizationCost;
    const realizedProfit = recAmt - totalCosts;
    const outstanding = Math.max(0, calc.expectedInflow - recAmt);

    return {
      ...calc,
      receivedAmount: recAmt,
      totalCosts,
      realizedProfit,
      outstanding,
    };
  }, [
    selectedModalProject,
    modalBillableCost,
    modalImsInvCost,
    modalCustomBillExVat,
    modalReceivedAmount,
  ]);

  async function handleSaveBill(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    setSaving(true);
    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editBillId,
          projectId: modalProjectId,
          forMonth: modalForMonth,
          billNumber: modalBillNo,
          poNumber: modalPoNo,
          status: modalStatus,
          billableCost: parseFloat(modalBillableCost) || 0,
          imsInvestment: parseFloat(modalImsInvCost) || 0,
          customBillExVat: modalCustomBillExVat ? parseFloat(modalCustomBillExVat) : undefined,
          receivedAmount: parseFloat(modalReceivedAmount) || 0,
          submittedAt: modalSubmittedAt || null,
          receivedAt: modalReceivedAt || null,
          deviationReason: modalDeviationReason,
          notes: modalNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setShowBillModal(false);
      setSaving(false);
      router.refresh();
    } catch (err: any) {
      setModalError(err.message || "Error saving");
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Top Navigation & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
        <div className="inline-flex flex-wrap rounded-lg p-1 bg-gray-100 border border-gray-200 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("PROJECT_PNL")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "PROJECT_PNL"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            📁 Projects Profit & Loss ({projectsOnly.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("EVENT_PNL")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "EVENT_PNL"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            🎪 Events Profit & Loss ({eventsOnly.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("BILLS_LEDGER")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "BILLS_LEDGER"
                ? "bg-emerald-700 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            🧾 Client Bills & Received Payments ({allBillsList.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "PROJECT_PNL" && (
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-gray-600">Period:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
              >
                <option value="ALL">All Months (Cumulative)</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Service Month: {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            type="text"
            placeholder="Search project, event, or bill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 w-48"
          />

          {canEditFinance && (
            <button
              type="button"
              onClick={() => openRecordPaymentModal()}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow-xs cursor-pointer whitespace-nowrap"
            >
              💰 + Record Client Bill / Payment Received
            </button>
          )}
        </div>
      </div>

      {/* Executive Summary KPI Cards for Accounts, Directors & MD */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-500 uppercase block">
            1. Requisition Spend
          </span>
          <span className="text-sm font-mono font-extrabold text-gray-900 mt-1 block">
            Tk {formatTaka(kpiTotals.totalCost)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Billable: {formatTaka(kpiTotals.billable)} • IMS Inv: {formatTaka(kpiTotals.imsInv)}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs">
          <span className="text-[10px] font-bold text-blue-800 uppercase block">
            2. Client Bill (With 15% VAT)
          </span>
          <span className="text-sm font-mono font-extrabold text-blue-900 mt-1 block">
            Tk {formatTaka(kpiTotals.billedWithVat)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Calculated from Billing Profile
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
          <span className="text-[10px] font-bold text-indigo-800 uppercase block">
            3. Expected Inflow (-AIT)
          </span>
          <span className="text-sm font-mono font-extrabold text-indigo-900 mt-1 block">
            Tk {formatTaka(kpiTotals.expectedInflow)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">
            Net receivable after AIT
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-800 uppercase block">
            4. Payment Received
          </span>
          <span className="text-sm font-mono font-extrabold text-emerald-700 mt-1 block">
            Tk {formatTaka(kpiTotals.receivedAmount)}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
            Due/Outstanding: Tk {formatTaka(kpiTotals.outstanding)}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border shadow-2xs ${
            kpiTotals.accruedProfit >= 0
              ? "bg-emerald-50/70 border-emerald-300"
              : "bg-red-50/70 border-red-300"
          }`}
        >
          <span className="text-[10px] font-bold text-gray-700 uppercase block">
            5. Accrued Profit / Loss
          </span>
          <span
            className={`text-sm font-mono font-extrabold mt-1 block ${
              kpiTotals.accruedProfit >= 0 ? "text-emerald-800" : "text-red-700"
            }`}
          >
            {kpiTotals.accruedProfit >= 0 ? "+" : ""}Tk {formatTaka(kpiTotals.accruedProfit)}
          </span>
          <span className="text-[10px] font-semibold text-gray-600 block mt-0.5">
            Expected Inflow − Total Cost
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border shadow-2xs ${
            kpiTotals.realizedProfit >= 0
              ? "bg-emerald-100/60 border-emerald-400"
              : "bg-amber-50/80 border-amber-300"
          }`}
        >
          <span className="text-[10px] font-bold text-gray-800 uppercase block">
            6. Realized Cash P&L
          </span>
          <span
            className={`text-sm font-mono font-extrabold mt-1 block ${
              kpiTotals.realizedProfit >= 0 ? "text-emerald-900" : "text-amber-900"
            }`}
          >
            {kpiTotals.realizedProfit >= 0 ? "+" : ""}Tk {formatTaka(kpiTotals.realizedProfit)}
          </span>
          <span className="text-[10px] font-semibold text-gray-600 block mt-0.5">
            Payment Received − Total Cost
          </span>
        </div>
      </div>

      {/* Tab 1 & 2: Projects Profit & Loss OR Events Profit & Loss Table */}
      {activeTab !== "BILLS_LEDGER" ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                  <th className="py-2.5 px-3">
                    {activeTab === "EVENT_PNL" ? "Event & Terms" : "Project & Terms"}
                  </th>
                  <th className="py-2.5 px-3 text-right">Billable Spend</th>
                  <th className="py-2.5 px-3 text-right">IMS Investment</th>
                  <th className="py-2.5 px-3 text-right">Total Spend</th>
                  <th className="py-2.5 px-3 text-right">Client Bill (With VAT)</th>
                  <th className="py-2.5 px-3 text-right">Expected Inflow (-AIT)</th>
                  <th className="py-2.5 px-3 text-right">Payment Received</th>
                  <th className="py-2.5 px-3 text-right">Accrued Profit / Loss</th>
                  <th className="py-2.5 px-3 text-right">Realized Cash P&L</th>
                  {canEditFinance && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activePnlRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-400">
                      No records found.
                    </td>
                  </tr>
                ) : (
                  activePnlRows.map((row) => {
                    const isProfit = row.accruedNetProfit >= 0;
                    const isRealizedProfit = row.realizedCashProfit >= 0;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-bold text-gray-900 block">{row.name}</span>
                          <span className="text-[10px] font-mono text-gray-500">
                            {row.code} &bull; {row.terms.billingProfile} &bull;{" "}
                            {row.activeReqCount} Req(s)
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-gray-800">
                          {formatTaka(row.activeBillableCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">
                          {formatTaka(row.activeImsInvestment)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">
                          {formatTaka(row.activeTotalCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-blue-800">
                          {formatTaka(row.billedWithVat)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-900">
                          {formatTaka(row.expectedInflow)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span className="font-bold text-emerald-700 block">
                            {formatTaka(row.receivedAmount)}
                          </span>
                          {row.outstandingAmount > 0 && (
                            <span className="text-[10px] text-amber-700">
                              Due: {formatTaka(row.outstandingAmount)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-bold ${
                              isProfit
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {isProfit ? "PROFIT +" : "LOSS "}
                            {formatTaka(row.accruedNetProfit)}
                          </span>
                          <span className="block text-[10px] text-gray-500 mt-0.5">
                            Margin: {row.marginPct}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={`font-bold ${
                              row.receivedAmount === 0
                                ? "text-gray-400"
                                : isRealizedProfit
                                ? "text-emerald-700"
                                : "text-red-600"
                            }`}
                          >
                            {row.receivedAmount === 0
                              ? "Awaiting Payment"
                              : `${isRealizedProfit ? "+" : ""}${formatTaka(
                                  row.realizedCashProfit
                                )}`}
                          </span>
                        </td>
                        {canEditFinance && (
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                openRecordPaymentModal(
                                  row,
                                  selectedMonth,
                                  row.matchingBills?.[0]
                                )
                              }
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-2xs cursor-pointer"
                            >
                              💰 {row.matchingBills?.length > 0 ? "Update Payment" : "Receive Payment"}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Tab 3: Client Bills & Payment Collections Ledger */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                  <th className="py-2.5 px-3">Project / Event</th>
                  <th className="py-2.5 px-3">Month / Bill No.</th>
                  <th className="py-2.5 px-3 text-right">Total Cost Spent</th>
                  <th className="py-2.5 px-3 text-right">Bill With VAT</th>
                  <th className="py-2.5 px-3 text-right">Expected (-AIT)</th>
                  <th className="py-2.5 px-3 text-right">Payment Received</th>
                  <th className="py-2.5 px-3 text-right">Realized P&L</th>
                  <th className="py-2.5 px-3">Dates & Status</th>
                  {canEditFinance && <th className="py-2.5 px-3 text-center">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allBillsList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-400">
                      No client bills or payment receipts recorded yet. Click{" "}
                      <strong>&ldquo;+ Record Client Bill / Payment Received&rdquo;</strong> to log a bill or payment.
                    </td>
                  </tr>
                ) : (
                  allBillsList.map((b) => {
                    const parentProj = projects.find((p) => p.id === b.projectId);
                    const totalCost = b.billableCost + b.imsInvestment;
                    return (
                      <tr key={b.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-3">
                          <span className="font-bold text-gray-900 block">{b.projectName}</span>
                          <span className="text-[10px] font-mono text-gray-500">
                            {b.projectCode}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-gray-800 block">{b.forMonth}</span>
                          <span className="text-[10px] font-mono text-gray-500">
                            {b.billNumber || "No Bill #"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-gray-800">
                          {formatTaka(totalCost)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-blue-800">
                          {formatTaka(b.billWithVat)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-900">
                          {formatTaka(b.expectedInflow)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatTaka(b.receivedAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              b.realizedNetProfit >= 0
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {b.realizedNetProfit >= 0 ? "PROFIT +" : "LOSS "}
                            {formatTaka(b.realizedNetProfit)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {b.status}
                          </span>
                          {b.receivedAt ? (
                            <span className="block text-[10px] text-emerald-700 mt-0.5">
                              Paid: {b.receivedAt}
                            </span>
                          ) : b.dueDate ? (
                            <span className="block text-[10px] text-amber-700 mt-0.5">
                              Due: {b.dueDate}
                            </span>
                          ) : null}
                        </td>
                        {canEditFinance && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                openRecordPaymentModal(parentProj, b.forMonth, b)
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 cursor-pointer"
                            >
                              ✏️ Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Client Bill & Payment Received Modal */}
      {showBillModal && selectedModalProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-gray-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  💰 Record Client Bill & Payment Received
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically calculates Client Bill (Ex-VAT & With VAT), AIT deduction, Expected Inflow, and Profit or Loss.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
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

            <form onSubmit={handleSaveBill} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Select Project or Event
                  </label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => {
                      const p = projects.find((x) => x.id === e.target.value);
                      setModalProjectId(e.target.value);
                      if (p) {
                        setModalBillableCost(String(p.totalBillableReq || 0));
                        setModalImsInvCost(String(p.totalImsInvReq || 0));
                      }
                    }}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  >
                    <optgroup label="📁 Projects">
                      {projectsOnly.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🎪 Events">
                      {eventsOnly.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Service Month
                  </label>
                  <input
                    type="month"
                    value={modalForMonth}
                    onChange={(e) => setModalForMonth(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Invoice / Bill No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026/10/491"
                    value={modalBillNo}
                    onChange={(e) => setModalBillNo(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Client PO / Reference
                  </label>
                  <input
                    type="text"
                    placeholder="Optional PO #"
                    value={modalPoNo}
                    onChange={(e) => setModalPoNo(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Collection Status
                  </label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  >
                    <option value="PO_RECEIVED">PO Received</option>
                    <option value="GR_RECEIVED">GR Received</option>
                    <option value="BILL_SUBMITTED">Bill Submitted (Awaiting Payment)</option>
                    <option value="PARTIAL_PAID">Partial Payment Received</option>
                    <option value="PAID">Paid / Collected</option>
                  </select>
                </div>
              </div>

              {/* Costs & Received Payment Inputs */}
              <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Billable Requisition Cost (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalBillableCost}
                    onChange={(e) => setModalBillableCost(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    IMS Investment Cost (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalImsInvCost}
                    onChange={(e) => setModalImsInvCost(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-800">
                    💵 Payment Received from Client (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={modalReceivedAmount}
                    onChange={(e) => setModalReceivedAmount(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border-2 border-emerald-400 rounded-md text-xs font-mono font-extrabold bg-emerald-50/40 text-emerald-900"
                  />
                </div>
              </div>

              {/* Live Profit / Loss Breakdown Card inside Modal */}
              {modalLiveCalc && (
                <div className="p-3.5 bg-blue-50/40 rounded-lg border border-blue-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-800 border-b border-blue-100 pb-1.5">
                    <span>
                      Calculated P&L ({modalLiveCalc.billingProfile} • Fee {modalLiveCalc.feeRatePct}% • AIT{" "}
                      {modalLiveCalc.aitRatePct}%)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setModalReceivedAmount(String(modalLiveCalc.expectedInflow))
                      }
                      className="text-[11px] text-blue-700 hover:underline cursor-pointer"
                    >
                      Set Received = Expected Inflow (Tk {formatTaka(modalLiveCalc.expectedInflow)})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                    <div>
                      <span className="text-gray-500 block">Bill Ex-VAT:</span>
                      <strong>Tk {formatTaka(modalLiveCalc.billExVat)}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">VAT (15%):</span>
                      <strong>Tk {formatTaka(modalLiveCalc.vatAmount)}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Bill With VAT:</span>
                      <strong className="text-blue-800">
                        Tk {formatTaka(modalLiveCalc.billWithVat)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Expected Inflow (-AIT):</span>
                      <strong className="text-indigo-900">
                        Tk {formatTaka(modalLiveCalc.expectedInflow)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Accrued Profit/Loss:</span>
                      <strong
                        className={
                          modalLiveCalc.netProfit >= 0 ? "text-emerald-700" : "text-red-600"
                        }
                      >
                        {modalLiveCalc.netProfit >= 0 ? "PROFIT +" : "LOSS "}Tk{" "}
                        {formatTaka(modalLiveCalc.netProfit)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Realized Cash P&L:</span>
                      <strong
                        className={
                          modalLiveCalc.realizedProfit >= 0
                            ? "text-emerald-800"
                            : "text-red-600"
                        }
                      >
                        {modalLiveCalc.realizedProfit >= 0 ? "PROFIT +" : "LOSS "}Tk{" "}
                        {formatTaka(modalLiveCalc.realizedProfit)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Bill Submitted Date
                  </label>
                  <input
                    type="date"
                    value={modalSubmittedAt}
                    onChange={(e) => setModalSubmittedAt(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Payment Received Date
                  </label>
                  <input
                    type="date"
                    value={modalReceivedAt}
                    onChange={(e) => setModalReceivedAt(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Payment Notes / Deduction Reason (if any)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Full payment received via BEFTN / Client deducted penalty..."
                  value={modalDeviationReason}
                  onChange={(e) => setModalDeviationReason(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow cursor-pointer"
                >
                  {saving ? "Saving..." : "✓ Save Bill & Payment Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
