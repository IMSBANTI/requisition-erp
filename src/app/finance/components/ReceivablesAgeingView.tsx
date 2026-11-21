"use client";

import React from "react";
import { deriveBillStatus, PAYMENT_TOLERANCE_BDT } from "@/lib/financeMetrics";
import { ClientBillItem, formatBDT, ProjectFinanceItem } from "./types";

export interface ReceivablesAgeingData {
  allBillRows: Array<{
    bill: ClientBillItem;
    project: ProjectFinanceItem;
    derived: ReturnType<typeof deriveBillStatus>;
  }>;
  filteredRows: Array<{
    bill: ClientBillItem;
    project: ProjectFinanceItem;
    derived: ReturnType<typeof deriveBillStatus>;
  }>;
  notYetDueTotal: number;
  dueSoonTotal: number;
  overdue1To30Total: number;
  overdue31To60Total: number;
  overdue60PlusTotal: number;
  notYetDueCount: number;
  dueSoonCount: number;
  overdue1To30Count: number;
  overdue31To60Count: number;
  overdue60PlusCount: number;
}

interface ReceivablesAgeingViewProps {
  receivablesAgeing: ReceivablesAgeingData;
  ageingFilter: string;
  setAgeingFilter: (v: string) => void;
  quickPayBillId: string;
  setQuickPayBillId: (v: string) => void;
  quickPayDate: string;
  setQuickPayDate: (v: string) => void;
  quickPayAmountStr: string;
  setQuickPayAmountStr: (v: string) => void;
  quickPayDeviationReason: string;
  setQuickPayDeviationReason: (v: string) => void;
  setSelectedTimelineBillId: (v: string) => void;
  saving: boolean;
  onQuickRecordPayment: (e: React.FormEvent) => void;
}

export default function ReceivablesAgeingView({
  receivablesAgeing,
  ageingFilter,
  setAgeingFilter,
  quickPayBillId,
  setQuickPayBillId,
  quickPayDate,
  setQuickPayDate,
  quickPayAmountStr,
  setQuickPayAmountStr,
  quickPayDeviationReason,
  setQuickPayDeviationReason,
  setSelectedTimelineBillId,
  saving,
  onQuickRecordPayment,
}: ReceivablesAgeingViewProps) {
  const selectedBillRow = receivablesAgeing.allBillRows.find(
    (x) => x.bill.id === quickPayBillId
  );
  const enteredAmount = Number(quickPayAmountStr || 0);
  const expectedOutstanding = selectedBillRow?.derived.outstanding ?? 0;
  const quickDiff = enteredAmount - expectedOutstanding;
  const isWithinTolerance =
    Boolean(selectedBillRow) &&
    quickPayAmountStr !== "" &&
    Math.abs(quickDiff) <= PAYMENT_TOLERANCE_BDT;

  return (
    <div className="space-y-6">
      {/* Top 4 Ageing KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() =>
            setAgeingFilter(ageingFilter === "NOT_YET_DUE" ? "ALL" : "NOT_YET_DUE")
          }
          className={`text-left p-4 rounded-xl border transition-all ${
            ageingFilter === "NOT_YET_DUE"
              ? "ring-2 ring-blue-600 bg-blue-50 border-blue-300"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="text-xs font-bold text-blue-700 uppercase">
            Not yet due
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 font-mono">
            Tk {formatBDT(receivablesAgeing.notYetDueTotal + receivablesAgeing.dueSoonTotal)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {receivablesAgeing.notYetDueCount + receivablesAgeing.dueSoonCount} active bill(s)
            {receivablesAgeing.dueSoonCount > 0
              ? ` (${receivablesAgeing.dueSoonCount} due within 7d)`
              : ""}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setAgeingFilter(
              ageingFilter === "OVERDUE_1_30" ? "ALL" : "OVERDUE_1_30"
            )
          }
          className={`text-left p-4 rounded-xl border transition-all ${
            ageingFilter === "OVERDUE_1_30"
              ? "ring-2 ring-amber-600 bg-amber-50 border-amber-300"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="text-xs font-bold text-amber-900 uppercase">
            1–30 days overdue
          </div>
          <div className="text-xl font-bold text-amber-950 mt-1 font-mono">
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
          className={`text-left p-4 rounded-xl border transition-all ${
            ageingFilter === "OVERDUE_31_60"
              ? "ring-2 ring-orange-600 bg-orange-50 border-orange-300"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="text-xs font-bold text-orange-900 uppercase">
            31–60 days overdue
          </div>
          <div className="text-xl font-bold text-orange-950 mt-1 font-mono">
            Tk {formatBDT(receivablesAgeing.overdue31To60Total)}
          </div>
          <div className="text-[11px] text-orange-800 mt-0.5">
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
          className={`text-left p-4 rounded-xl border transition-all ${
            ageingFilter === "OVERDUE_60_PLUS"
              ? "ring-2 ring-rose-700 bg-rose-50 border-rose-300"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="text-xs font-bold text-rose-900 uppercase">
            Over 60 days
          </div>
          <div className="text-xl font-bold text-rose-950 mt-1 font-mono">
            Tk {formatBDT(receivablesAgeing.overdue60PlusTotal)}
          </div>
          <div className="text-[11px] text-rose-800 mt-0.5">
            {receivablesAgeing.overdue60PlusCount} critical bill(s)
          </div>
        </button>
      </div>

      {/* 2-Column Split: Bills Awaiting Payment (Left 2/3) + Record Payment Received (Right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">
              Bills awaiting payment (
              {
                receivablesAgeing.filteredRows.filter(
                  (r) => r.derived.code !== "PAID"
                ).length
              }
              )
            </h3>
            <span className="text-xs text-gray-500">
              Click any row to select for payment recording
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Bill no.</th>
                  <th className="py-2.5 px-3">Due date</th>
                  <th className="py-2.5 px-3 text-right">Outstanding</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receivablesAgeing.filteredRows
                  .filter((r) => r.derived.code !== "PAID")
                  .map(({ bill, project, derived }) => (
                    <tr
                      key={bill.id}
                      onClick={() => {
                        setQuickPayBillId(bill.id);
                        setQuickPayAmountStr(String(derived.outstanding));
                        setSelectedTimelineBillId(bill.id);
                      }}
                      className={`cursor-pointer hover:bg-blue-50/60 transition-colors ${
                        quickPayBillId === bill.id
                          ? "bg-blue-50 font-semibold"
                          : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {project.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-600">
                        {bill.billNumber || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {bill.dueDate || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                        Tk {formatBDT(derived.outstanding)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${derived.cls}`}
                        >
                          {derived.label}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1/3: Record Payment Received Form */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Record payment received
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Select a bill from the left table or pick from dropdown.
            </p>
          </div>

          <form onSubmit={onQuickRecordPayment} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Bill
              </label>
              <select
                value={quickPayBillId}
                onChange={(e) => {
                  const id = e.target.value;
                  setQuickPayBillId(id);
                  const b = receivablesAgeing.allBillRows.find(
                    (x) => x.bill.id === id
                  );
                  if (b) {
                    setQuickPayAmountStr(String(b.derived.outstanding));
                    setSelectedTimelineBillId(id);
                  }
                }}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold"
                required
              >
                <option value="">Select a bill to pay...</option>
                {receivablesAgeing.allBillRows
                  .filter((r) => r.derived.code !== "PAID")
                  .map(({ bill, project, derived }) => (
                    <option key={bill.id} value={bill.id}>
                      {project.name} • {bill.billNumber || bill.forMonth} (Tk{" "}
                      {formatBDT(derived.outstanding)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Date received
              </label>
              <input
                type="date"
                value={quickPayDate}
                onChange={(e) => setQuickPayDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Amount received (BDT)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={quickPayAmountStr}
                onChange={(e) => setQuickPayAmountStr(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-xs font-bold font-mono"
                required
              />
              {selectedBillRow && quickPayAmountStr !== "" && (
                <div
                  className={`mt-1 text-[11px] font-semibold ${
                    isWithinTolerance ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {isWithinTolerance
                    ? "✓ Matches expected outstanding (within ±10 BDT tolerance → Full Paid)."
                    : `Deviation vs outstanding: ${quickDiff >= 0 ? "+" : ""}Tk ${formatBDT(quickDiff)}`}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Deviation reason (if different)
              </label>
              <input
                type="text"
                placeholder="Optional note"
                value={quickPayDeviationReason}
                onChange={(e) => setQuickPayDeviationReason(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !quickPayBillId}
              className="w-full py-2.5 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 disabled:opacity-50 shadow-sm"
            >
              {saving ? "Saving..." : "Save payment"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
