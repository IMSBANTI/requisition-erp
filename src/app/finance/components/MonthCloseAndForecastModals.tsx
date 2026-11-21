"use client";

import React from "react";
import { ProjectFinanceItem } from "./types";

interface MonthCloseModalProps {
  open: boolean;
  project: ProjectFinanceItem | null;
  mode: "CLOSE" | "REOPEN";
  targetMonth: string;
  reason: string;
  saving: boolean;
  setTargetMonth: (m: string) => void;
  setMode: (mode: "CLOSE" | "REOPEN") => void;
  setReason: (r: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function MonthCloseModal({
  open,
  project,
  mode,
  targetMonth,
  reason,
  saving,
  setTargetMonth,
  setMode,
  setReason,
  onClose,
  onSubmit,
}: MonthCloseModalProps) {
  if (!open || !project) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {mode === "CLOSE"
                ? "🔒 Close & Lock Project Month"
                : "🔓 Reopen Closed Project Month"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {project.name} ({project.code})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Target Service Month (YYYY-MM)
            </label>
            <input
              type="text"
              required
              value={targetMonth}
              onChange={(e) => {
                const m = e.target.value;
                setTargetMonth(m);
                setMode(project.closedMonths?.[m] ? "REOPEN" : "CLOSE");
              }}
              placeholder="e.g. 2026-10"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono font-bold"
            />
          </div>

          {mode === "CLOSE" ? (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-[11px] text-gray-700">
              <div className="font-bold text-slate-900">
                Month-Close Readiness Checks:
              </div>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  No open/unexecuted Requisitions in <strong>{targetMonth}</strong>
                </li>
                <li>
                  Client Bill exists for <strong>{targetMonth}</strong> OR a
                  No-Bill Reason is provided below
                </li>
              </ul>
              <div className="pt-1">
                <label className="block font-semibold text-gray-700 mb-1">
                  No-Bill Reason (Only required if no Client Bill is recorded for{" "}
                  {targetMonth})
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional if bill exists (e.g. Pre-launch setup month)"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Mandatory Audit Reason to Reopen {targetMonth} *
              </label>
              <textarea
                rows={2}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for reopening this locked month..."
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-1.5 rounded-lg text-white font-bold cursor-pointer disabled:opacity-50 ${
                mode === "CLOSE"
                  ? "bg-slate-900 hover:bg-slate-800"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {saving
                ? "Processing..."
                : mode === "CLOSE"
                ? "🔒 Confirm & Lock Month"
                : "🔓 Reopen Month"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ForecastOverrideModalProps {
  open: boolean;
  project: ProjectFinanceItem | null;
  targetMonth: string;
  amountStr: string;
  noteStr: string;
  saving: boolean;
  setAmountStr: (v: string) => void;
  setNoteStr: (v: string) => void;
  onClose: () => void;
  onSave: (clearOverride: boolean) => void;
}

export function ForecastOverrideModal({
  open,
  project,
  targetMonth,
  amountStr,
  noteStr,
  saving,
  setAmountStr,
  setNoteStr,
  onClose,
  onSave,
}: ForecastOverrideModalProps) {
  if (!open || !project) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              🔮 Manual Forecast Override — {targetMonth}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {project.name} ({project.code})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 font-bold"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Forecast Net Profit for {targetMonth} (BDT)
            </label>
            <input
              type="number"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full rounded-lg border-2 border-purple-500 px-3 py-2 font-mono font-bold text-sm"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Forecast Note / Assumption
            </label>
            <input
              type="text"
              value={noteStr}
              onChange={(e) => setNoteStr(e.target.value)}
              placeholder="e.g. Expected seasonal ramp-up / new headcount"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold hover:bg-amber-100 cursor-pointer"
            >
              ↺ Revert to Auto (3M Avg)
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave(false)}
                className="px-4 py-1.5 rounded-lg bg-purple-700 text-white font-bold hover:bg-purple-800 cursor-pointer disabled:opacity-50"
              >
                Save Manual Forecast
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
