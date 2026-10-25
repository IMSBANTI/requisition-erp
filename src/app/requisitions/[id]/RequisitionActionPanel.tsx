"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "signature_pad";

interface PersonOption {
  id: string;
  name: string;
  designation: string;
}

interface LineItemOption {
  id: string;
  sl: number;
  particulars: string;
  costHead?: string | null;
  costTag?: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface PanelProps {
  requisitionId: string;
  number: string | null;
  status: string;
  actions: string[];
  userName: string;
  userEmail: string;
  userPermissions: string[];
  userSignature: string | null;
  hasPin: boolean;
  accountsExecutives: PersonOption[];
  directors: PersonOption[];
  defaultDirectorId?: string | null;
  items?: LineItemOption[];
}

const ACTION_TITLES: Record<string, string> = {
  APPROVE: "Approve & Sign Voucher",
  APPROVE_TO_ACCOUNTS: "Sign & Send to Accounts",
  APPROVE_TO_DIRECTOR: "Sign & Send to Director",
  APPROVE_TO_MD: "Sign & Forward to Managing Director (MD)",
  FORWARD: "Sign by Accounts & Assign Executive to Pay",
  EXECUTE: "Sign by Accounts & Pay Money (Mark Disbursed)",
  RETURN: "Return Requisition for Correction",
  REJECT: "Reject Requisition",
};

export default function RequisitionActionPanel({
  requisitionId,
  number,
  status,
  actions,
  userName,
  userEmail,
  userPermissions,
  userSignature,
  hasPin,
  accountsExecutives,
  directors,
  defaultDirectorId,
  items = [],
}: PanelProps) {
  const router = useRouter();

  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [pinOrPassword, setPinOrPassword] = useState("");
  const [forwardToId, setForwardToId] = useState(accountsExecutives[0]?.id || "");
  const [targetDirectorId, setTargetDirectorId] = useState(
    defaultDirectorId || directors[0]?.id || ""
  );
  const [showDrawPad, setShowDrawPad] = useState(!userSignature);
  const [adjustLowerMode, setAdjustLowerMode] = useState(false);
  const [adjustedPrices, setAdjustedPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const isDirector = userPermissions.includes("req.director");
  const isMd = userPermissions.includes("req.md");
  const isAccountsMgr =
    userPermissions.includes("req.accounts.check") || userPermissions.includes("req.forward");
  const isAccountsExec =
    userPermissions.includes("req.execute") && !isAccountsMgr;

  useEffect(() => {
    if (selectedAction && showDrawPad && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth || 360;
      canvas.height = 110;
      padRef.current = new SignaturePad(canvas, {
        penColor: "#111827",
        backgroundColor: "rgba(255,255,255,0)",
      });
    }
    return () => {
      padRef.current = null;
    };
  }, [selectedAction, showDrawPad]);

  function openActionModal(act: string) {
    setSelectedAction(act);
    setError("");
    setShowDrawPad(!userSignature);
    setAdjustLowerMode(false);
    const initialMap: Record<string, string> = {};
    for (const it of items) {
      initialMap[it.id] = String(it.unitPrice);
    }
    setAdjustedPrices(initialMap);
    // Pre-fill email if user doesn't have a 4-digit PIN set for faster 1-click signing
    if (!hasPin && userEmail) {
      setPinOrPassword(userEmail);
    } else {
      setPinOrPassword("");
    }
  }

  async function handleConfirmAction() {
    if (!selectedAction) return;
    setError("");

    const hasReducedAnyLine =
      adjustLowerMode &&
      items.some(
        (it) =>
          adjustedPrices[it.id] !== undefined &&
          parseFloat(adjustedPrices[it.id]) < it.unitPrice
      );

    if (hasReducedAnyLine && !comment.trim()) {
      setError("Please enter a comment/reason when approving a lower amount.");
      return;
    }

    setLoading(true);

    try {
      let signatureDataUrl: string | undefined = undefined;
      if (showDrawPad && padRef.current && !padRef.current.isEmpty()) {
        signatureDataUrl = padRef.current.toDataURL("image/png");
      }

      const res = await fetch(`/api/requisitions/${requisitionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          comment,
          pinOrPassword,
          forwardToId: selectedAction === "FORWARD" ? forwardToId : undefined,
          targetDirectorId:
            selectedAction === "APPROVE_TO_DIRECTOR" ? targetDirectorId : undefined,
          signatureDataUrl,
          adjustedItems: hasReducedAnyLine
            ? items.map((it) => ({
                id: it.id,
                unitPrice: Math.min(
                  it.unitPrice,
                  Math.max(0, parseFloat(adjustedPrices[it.id]) || 0)
                ),
              }))
            : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }

      setSelectedAction(null);
      setComment("");
      setPinOrPassword("");
      setLoading(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  if (actions.length === 0) {
    return (
      <div className="mt-4 bg-gray-50 p-3.5 rounded-xl border border-gray-200 flex items-center justify-between text-xs text-gray-600">
        <div>
          <span className="font-bold text-gray-800">Current Stage: {status}</span>
          <span className="ml-2 text-gray-500">
            (No pending signature action required from your account at this stage)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      id="requisition-action-panel"
      className="mt-4 bg-white p-4 sm:p-5 rounded-xl border-2 border-[#E42528] shadow-md"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-red-100 text-[#E42528] text-[10px] font-extrabold uppercase tracking-wider">
              Action Required
            </span>
            <h3 className="text-sm font-bold text-gray-900">
              Sign, Approve, Forward or Disburse Requisition ({userName})
            </h3>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {isDirector
              ? "As Director, you can sign and send to Accounts (for payment/vetting), or sign and forward to MD for further approval."
              : isMd
              ? "As Managing Director, you can sign final management approval and release to Accounts for payment."
              : isAccountsMgr
              ? "As Accounts Manager, you can sign 'Checked by Accounts' and send to Director, forward to MD, assign an Executive to pay, or pay directly."
              : isAccountsExec
              ? "As Accounts Executive, you can sign and disburse/pay the approved requisition amount."
              : "Choose how you want to sign and route this requisition below:"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Director / MD / Manager: Sign & Send to Accounts */}
          {actions.includes("APPROVE_TO_ACCOUNTS") && (
            <button
              type="button"
              onClick={() => openActionModal("APPROVE_TO_ACCOUNTS")}
              className="px-3.5 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>✍️</span>
              <span>
                {isMd
                  ? "Sign as MD & Send to Accounts (Pay)"
                  : isDirector
                  ? "Sign as Director & Send to Accounts"
                  : "Sign & Send to Accounts"}
              </span>
            </button>
          )}

          {/* 2. Manager / Accounts: Sign & Send to Director */}
          {actions.includes("APPROVE_TO_DIRECTOR") && (
            <button
              type="button"
              onClick={() => openActionModal("APPROVE_TO_DIRECTOR")}
              className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>✍️</span>
              <span>
                {isAccountsMgr
                  ? "Sign by Accounts & Send to Director"
                  : "Sign & Send to Director"}
              </span>
            </button>
          )}

          {/* 3. Director / Accounts: Sign & Forward to MD */}
          {actions.includes("APPROVE_TO_MD") && (
            <button
              type="button"
              onClick={() => openActionModal("APPROVE_TO_MD")}
              className="px-3.5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>👑</span>
              <span>
                {isAccountsMgr
                  ? "Sign by Accounts & Forward to MD"
                  : "Sign & Forward to MD"}
              </span>
            </button>
          )}

          {/* 4. Accounts Manager: Sign & Assign Accounts Executive to Pay */}
          {actions.includes("FORWARD") && (
            <button
              type="button"
              onClick={() => openActionModal("FORWARD")}
              className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>💸</span>
              <span>Sign by Accounts & Assign Exec to Pay</span>
            </button>
          )}

          {/* 5. Accounts Manager / Executive: Sign & Pay Money Now */}
          {actions.includes("EXECUTE") && (
            <button
              type="button"
              onClick={() => openActionModal("EXECUTE")}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>💰</span>
              <span>
                {isAccountsMgr
                  ? "Sign by Accounts & Pay Money Now"
                  : "Sign & Pay Money (Mark Disbursed)"}
              </span>
            </button>
          )}

          {/* 6. Return for Correction */}
          {actions.includes("RETURN") && (
            <button
              type="button"
              onClick={() => openActionModal("RETURN")}
              className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors cursor-pointer"
            >
              ↩ Return
            </button>
          )}

          {/* 7. Reject */}
          {actions.includes("REJECT") && (
            <button
              type="button"
              onClick={() => openActionModal("REJECT")}
              className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors cursor-pointer"
            >
              ✕ Reject
            </button>
          )}
        </div>
      </div>

      {/* Confirmation & Digital Signature Modal */}
      {selectedAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  {ACTION_TITLES[selectedAction] || selectedAction}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Voucher: <strong>{number || "Requisition"}</strong> &bull; Signer:{" "}
                  <strong>{userName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="text-gray-400 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-700 font-semibold rounded">
                {error}
              </div>
            )}

            {/* If sending to Director, allow choosing which Director */}
            {selectedAction === "APPROVE_TO_DIRECTOR" && directors.length > 0 && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-700">
                  Select Director for Approval
                </label>
                <select
                  value={targetDirectorId}
                  onChange={(e) => setTargetDirectorId(e.target.value)}
                  className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-semibold"
                >
                  {directors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.designation})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* If forwarding to Accounts Executive for payment */}
            {selectedAction === "FORWARD" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-700">
                  Assign Accounts Executive to Pay / Disburse Money
                </label>
                <select
                  value={forwardToId}
                  onChange={(e) => setForwardToId(e.target.value)}
                  className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-semibold"
                >
                  {accountsExecutives.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.designation})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Digital Signature Preview or Draw Pad */}
            {selectedAction !== "REJECT" && selectedAction !== "RETURN" && (
              <>
                {items.length > 0 && selectedAction.startsWith("APPROVE") && (
                  <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-800">
                        Approve Lower Amount (Optional)
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdjustLowerMode(!adjustLowerMode)}
                        className="text-[11px] font-bold text-amber-800 hover:underline cursor-pointer"
                      >
                        {adjustLowerMode ? "Cancel Adjustment" : "✏️ Adjust Line Amounts Downward"}
                      </button>
                    </div>
                    {adjustLowerMode && (
                      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {items.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded border border-gray-200 text-xs"
                          >
                            <div className="truncate flex-1">
                              <span className="font-semibold text-gray-800">
                                {it.sl}. {it.particulars}
                              </span>
                              <span className="block text-[10px] text-gray-400">
                                Requested Unit Price: Tk {it.unitPrice} (Qty: {it.qty})
                              </span>
                            </div>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max={it.unitPrice}
                              value={adjustedPrices[it.id] ?? String(it.unitPrice)}
                              onChange={(e) =>
                                setAdjustedPrices({
                                  ...adjustedPrices,
                                  [it.id]: e.target.value,
                                })
                              }
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-mono font-bold text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-800">
                    Your Digital Signature on Voucher
                  </label>
                  {userSignature && (
                    <button
                      type="button"
                      onClick={() => setShowDrawPad(!showDrawPad)}
                      className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      {showDrawPad ? "Use Saved Signature" : "Draw New Signature"}
                    </button>
                  )}
                </div>

                {!showDrawPad && userSignature ? (
                  <div className="bg-white border border-gray-200 rounded p-2 text-center">
                    <img
                      src={userSignature}
                      alt="Your Signature"
                      className="h-12 w-auto mx-auto object-contain"
                    />
                    <span className="text-[10px] text-green-700 font-semibold block mt-1">
                      ✓ Saved Signature Ready
                    </span>
                  </div>
                ) : (
                  <div>
                    <div className="bg-white border border-dashed border-gray-300 rounded overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        className="w-full h-[110px] touch-none cursor-crosshair"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-gray-500">
                        Draw your signature above (saves automatically to your profile)
                      </span>
                      <button
                        type="button"
                        onClick={() => padRef.current?.clear()}
                        className="text-[10px] font-semibold text-red-600 hover:underline cursor-pointer"
                      >
                        Clear Pad
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </>
            )}

            {/* Comments / Notes */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">
                {selectedAction === "REJECT" || selectedAction === "RETURN"
                  ? "Reason / Remarks (Required):"
                  : "Approval / Payment Notes (Optional):"}
              </label>
              <textarea
                rows={2}
                value={comment}
                required={selectedAction === "REJECT" || selectedAction === "RETURN"}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter optional remarks..."
                className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            {/* PIN or Password Verification */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700">
                  4-Digit PIN or Login Password
                </label>
                <button
                  type="button"
                  onClick={() => setPinOrPassword(userEmail)}
                  className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Use My Email ({userEmail})
                </button>
              </div>
              <input
                type="password"
                required
                value={pinOrPassword}
                onChange={(e) => setPinOrPassword(e.target.value)}
                placeholder="Enter 4-digit PIN or your email address"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !pinOrPassword}
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow cursor-pointer disabled:opacity-50 ${
                  selectedAction === "REJECT"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {loading
                  ? "Signing & Processing..."
                  : `✓ Confirm & Sign (${ACTION_TITLES[selectedAction] || selectedAction})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
