"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PanelProps {
  requisitionId: string;
  number: string | null;
  status: string;
  actions: string[];
  userSignature: string | null;
  hasPin: boolean;
  accountsExecutives: { id: string; name: string; designation: string }[];
}

export default function RequisitionActionPanel({
  requisitionId,
  number,
  status,
  actions,
  userSignature,
  hasPin,
  accountsExecutives,
}: PanelProps) {
  const router = useRouter();

  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [pinOrPassword, setPinOrPassword] = useState("");
  const [forwardToId, setForwardToId] = useState(accountsExecutives[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (actions.length === 0) return null;

  async function handleConfirmAction() {
    if (!selectedAction) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/requisitions/${requisitionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          comment,
          pinOrPassword,
          forwardToId: selectedAction === "FORWARD" ? forwardToId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }

      setSelectedAction(null);
      setComment("");
      setPinOrPassword("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 bg-white p-4 rounded-xl border-2 border-red-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
            <span>⚡</span>
            <span>Approval & Workflow Actions</span>
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            You are authorized to act on this stage of the requisition.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("APPROVE") && (
            <button
              type="button"
              onClick={() => setSelectedAction("APPROVE")}
              className="px-4 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm transition-colors cursor-pointer"
            >
              ✓ Approve & Sign
            </button>
          )}

          {actions.includes("FORWARD") && (
            <button
              type="button"
              onClick={() => setSelectedAction("FORWARD")}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors cursor-pointer"
            >
              Forward to Executive &rarr;
            </button>
          )}

          {actions.includes("EXECUTE") && (
            <button
              type="button"
              onClick={() => setSelectedAction("EXECUTE")}
              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-colors cursor-pointer"
            >
              💰 Mark Executed / Disbursed
            </button>
          )}

          {actions.includes("RETURN") && (
            <button
              type="button"
              onClick={() => setSelectedAction("RETURN")}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 transition-colors cursor-pointer"
            >
              ↩ Return for Correction
            </button>
          )}

          {actions.includes("REJECT") && (
            <button
              type="button"
              onClick={() => setSelectedAction("REJECT")}
              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors cursor-pointer"
            >
              ✕ Reject
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h4 className="text-sm font-bold text-gray-900">
              Confirm Action:{" "}
              <span className="text-[#E42528] uppercase">{selectedAction}</span>
            </h4>
            <p className="text-xs text-gray-500 mt-1">
              Requisition: <strong>{number || "Voucher"}</strong>
            </p>

            {error && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
                {error}
              </div>
            )}

            {selectedAction === "FORWARD" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-700">
                  Assign Accounts Executive for Execution
                </label>
                <select
                  value={forwardToId}
                  onChange={(e) => setForwardToId(e.target.value)}
                  className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium"
                >
                  {accountsExecutives.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.designation})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">
                {selectedAction === "REJECT" || selectedAction === "RETURN"
                  ? "Reason / Remarks (Required):"
                  : "Comments / Notes (Optional):"}
              </label>
              <textarea
                rows={2}
                value={comment}
                required={selectedAction === "REJECT" || selectedAction === "RETURN"}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter remarks here..."
                className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">
                Enter your 4-digit PIN or password to sign
              </label>
              <input
                type="password"
                required
                autoFocus
                value={pinOrPassword}
                onChange={(e) => setPinOrPassword(e.target.value)}
                placeholder="••••"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center font-mono tracking-widest focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !pinOrPassword}
                onClick={handleConfirmAction}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded shadow disabled:opacity-50 ${
                  selectedAction === "REJECT"
                    ? "bg-red-600 hover:bg-red-700"
                    : selectedAction === "APPROVE"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-[#E42528] hover:bg-[#B81D20]"
                }`}
              >
                {loading ? "Processing..." : `Confirm ${selectedAction}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
