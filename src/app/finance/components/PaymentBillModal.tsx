"use client";

import React from "react";
import { PAYMENT_TOLERANCE_BDT } from "@/lib/financeMetrics";
import { formatBDT, ProjectFinanceItem } from "./types";

interface PaymentBillModalProps {
  open: boolean;
  project: ProjectFinanceItem | null;
  editingBillId: string | null;
  formMonth: string;
  setFormMonth: (v: string) => void;
  formStatus: string;
  setFormStatus: (v: string) => void;
  formBillNo: string;
  setFormBillNo: (v: string) => void;
  formPoNo: string;
  setFormPoNo: (v: string) => void;
  formSubmittedAt: string;
  setFormSubmittedAt: (v: string) => void;
  formDueDate: string;
  setFormDueDate: (v: string) => void;
  formBillableCost: string;
  formImsInv: string;
  formBillExVat: string;
  setFormBillExVat: (v: string) => void;
  formVatAmt: string;
  setFormVatAmt: (v: string) => void;
  formAitAmt: string;
  setFormAitAmt: (v: string) => void;
  formReceivedAmt: string;
  setFormReceivedAmt: (v: string) => void;
  formReceivedAt: string;
  setFormReceivedAt: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  formIsOpeningBalance: boolean;
  setFormIsOpeningBalance: (v: boolean) => void;
  liveBillWithVat: number;
  liveExpectedInflow: number;
  liveDeviation: number;
  saving: boolean;
  computeDueDateStr: (submittedDateStr: string, cycleDays: number) => string;
  onAutoRecalculate: (newBillableStr: string, newImsStr: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function PaymentBillModal({
  open,
  project,
  editingBillId,
  formMonth,
  setFormMonth,
  formStatus,
  setFormStatus,
  formBillNo,
  setFormBillNo,
  formPoNo,
  setFormPoNo,
  formSubmittedAt,
  setFormSubmittedAt,
  formDueDate,
  setFormDueDate,
  formBillableCost,
  formImsInv,
  formBillExVat,
  setFormBillExVat,
  formVatAmt,
  setFormVatAmt,
  formAitAmt,
  setFormAitAmt,
  formReceivedAmt,
  setFormReceivedAmt,
  formReceivedAt,
  setFormReceivedAt,
  formNotes,
  setFormNotes,
  formIsOpeningBalance,
  setFormIsOpeningBalance,
  liveBillWithVat,
  liveExpectedInflow,
  liveDeviation,
  saving,
  computeDueDateStr,
  onAutoRecalculate,
  onClose,
  onSubmit,
}: PaymentBillModalProps) {
  if (!open || !project) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl border border-gray-200 overflow-hidden">
        <div className="shrink-0 flex items-start justify-between border-b border-gray-200 px-5 py-3 bg-white">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-gray-900">
              {editingBillId
                ? "✏️ Edit Payment / Client Bill Record"
                : "💰 Record Partial or Full Client Payment"}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {project.kind === "EVENT" ? "🎪 Event: " : "📁 Project: "}
              <strong>{project.name}</strong> ({project.code}) • Cycle:{" "}
              <strong>{project.terms.billCycleDays} Days</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg font-bold leading-none p-1 cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0 text-xs">
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
                  Service Month
                </label>
                <input
                  type="text"
                  required
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  placeholder="e.g. 2026-10"
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
                  Payment Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 font-semibold"
                >
                  <option value="PARTIAL_PAID">Partial Payment</option>
                  <option value="PAID">Full / Final Payment</option>
                  <option value="SUBMITTED">Bill Submitted (Unpaid)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
                  Invoice / Bill #
                </label>
                <input
                  type="text"
                  value={formBillNo}
                  onChange={(e) => setFormBillNo(e.target.value)}
                  placeholder="e.g. INV-2026-042"
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
                  PO Number
                </label>
                <input
                  type="text"
                  value={formPoNo}
                  onChange={(e) => setFormPoNo(e.target.value)}
                  placeholder="e.g. PO-8821"
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-blue-50/40 border border-blue-100 rounded-xl p-2.5">
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
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
                        computeDueDateStr(sub, project.terms.billCycleDays)
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-0.5">
                  Maturity / Due Date (+{project.terms.billCycleDays}d auto)
                </label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1"
                />
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 space-y-2">
              <div className="font-bold text-gray-800">
                1. Requisition Cost &amp; Expected Client Bill Snapshot (Tk)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-gray-600 mb-0.5">
                    Billable Requisition Cost (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBillableCost}
                    onChange={(e) => onAutoRecalculate(e.target.value, formImsInv)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-0.5">
                    IMS Own Investment Cost (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formImsInv}
                    onChange={(e) =>
                      onAutoRecalculate(formBillableCost, e.target.value)
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-blue-800 mb-0.5">
                    Client Bill Ex-VAT (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formBillExVat}
                    onChange={(e) => setFormBillExVat(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white px-2.5 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-blue-800 mb-0.5">
                    15% VAT Amount (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formVatAmt}
                    onChange={(e) => setFormVatAmt(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white px-2.5 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-blue-800 mb-0.5">
                    AIT Deducted by Client (Tk)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formAitAmt}
                    onChange={(e) => setFormAitAmt(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white px-2.5 py-1 font-mono"
                  />
                </div>
              </div>
              <div className="text-[11px] text-blue-900">
                Bill With VAT: <strong>Tk {formatBDT(liveBillWithVat)}</strong> •
                Expected Net Inflow (Bill Ex-VAT − AIT):{" "}
                <strong>Tk {formatBDT(liveExpectedInflow)}</strong>
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-emerald-900 mb-0.5">
                    Received Payment Amount (Tk) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formReceivedAmt}
                    onChange={(e) => setFormReceivedAmt(e.target.value)}
                    placeholder="Enter amount received (0 if only submitting bill)"
                    className="w-full rounded-lg border-2 border-emerald-500 bg-white px-2.5 py-1.5 font-mono font-bold text-sm text-emerald-950"
                  />
                </div>
                <div>
                  <label className="block text-emerald-900 font-semibold mb-0.5">
                    Payment Received Date
                  </label>
                  <input
                    type="date"
                    value={formReceivedAt}
                    onChange={(e) => setFormReceivedAt(e.target.value)}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-0.5">
                  Installment Description / Bank Reference / Deviation Reason
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. 1st Partial Payment (40% Advance via Bank Transfer)"
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1"
                />
              </div>

              <label className="flex items-start gap-2 pt-0.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formIsOpeningBalance}
                  onChange={(e) => setFormIsOpeningBalance(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-[11px] text-gray-800">
                  <strong>
                    Opening Balance Bill (Receivables &amp; Overdue Ageing Only)
                  </strong>{" "}
                  — Prior-period invoice carried forward; counts in Receivables &amp; Overdue Ageing, excluded from current-year P&amp;L.
                </span>
              </label>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50/70">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-1.5 rounded-lg bg-gray-900 text-white font-bold hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving..." : "Save Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
