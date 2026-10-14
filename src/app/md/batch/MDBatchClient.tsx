"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTaka } from "@/lib/money";

interface Props {
  requisitions: {
    id: string;
    number: string | null;
    date: string;
    companyName: string;
    projectName: string;
    category: string;
    makerName: string;
    total: string;
    status: string;
    directorName: string;
  }[];
  userSignature: string | null;
}

export default function MDBatchClient({ requisitions, userSignature }: Props) {
  const router = useRouter();

  const [selectedIds, setSelectedIds] = useState<string[]>(requisitions.map((r) => r.id));
  const [showSignModal, setShowSignModal] = useState(false);
  const [pinOrPassword, setPinOrPassword] = useState("");
  const [comment, setComment] = useState("Batch approved by Managing Director");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedTotal = useMemo(() => {
    return requisitions
      .filter((r) => selectedIds.includes(r.id))
      .reduce((sum, r) => sum + parseFloat(r.total || "0"), 0);
  }, [requisitions, selectedIds]);

  function toggleAll() {
    if (selectedIds.length === requisitions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(requisitions.map((r) => r.id));
    }
  }

  function toggleOne(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  async function handleBatchSubmit() {
    if (selectedIds.length === 0) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/requisitions/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          pinOrPassword,
          comment,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Batch approval failed");
      }

      setShowSignModal(false);
      setPinOrPassword("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  if (requisitions.length === 0) {
    return (
      <div className="mt-8 bg-white p-12 text-center rounded-xl border border-gray-200">
        <span className="text-3xl">🎉</span>
        <h3 className="text-sm font-bold text-gray-900 mt-2">All Caught Up!</h3>
        <p className="text-xs text-gray-500 mt-1">
          There are no requisitions currently waiting in the Managing Director batch queue.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Batch Summary Bar */}
      <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">
            Selection Summary
          </span>
          <div className="text-sm text-purple-950 font-semibold mt-0.5">
            <strong>{selectedIds.length}</strong> of {requisitions.length} requisitions selected &bull; Total:{" "}
            <span className="font-extrabold text-base text-[#E42528] ml-1">
              Tk {formatTaka(selectedTotal)}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => setShowSignModal(true)}
          className="px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-md shadow disabled:opacity-50 transition-colors cursor-pointer"
        >
          Digitally Sign & Approve Selected ({selectedIds.length}) &rarr;
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === requisitions.length}
                    onChange={toggleAll}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                </th>
                <th className="py-2.5 px-4">Req # / Date</th>
                <th className="py-2.5 px-4">Company & Project</th>
                <th className="py-2.5 px-4">Maker</th>
                <th className="py-2.5 px-4">Director Approved</th>
                <th className="py-2.5 px-4 text-right">Amount (Tk)</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requisitions.map((req) => (
                <tr key={req.id} className="hover:bg-purple-50/30 transition-colors">
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(req.id)}
                      onChange={() => toggleOne(req.id)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/requisitions/${req.id}`}
                      className="font-bold text-gray-900 hover:text-purple-700"
                    >
                      {req.number || "Voucher"}
                    </Link>
                    <span className="block text-[11px] text-gray-400">
                      {new Date(req.date).toLocaleDateString("en-GB")}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-gray-800">{req.companyName}</span>
                    <span className="block text-[11px] text-gray-500 truncate max-w-[180px]">
                      {req.projectName}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-800">{req.makerName}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                      ✓ {req.directorName}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900">
                    {formatTaka(req.total)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/requisitions/${req.id}`}
                      className="text-xs font-semibold text-purple-700 hover:underline mr-2"
                    >
                      Review
                    </Link>
                    <Link
                      href={`/requisitions/${req.id}/print`}
                      target="_blank"
                      className="text-gray-500 hover:text-gray-800"
                    >
                      🖨️
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature Confirmation Modal */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
              <span>✍️</span>
              <span>Managing Director — Batch Signature</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              You are approving <strong>{selectedIds.length}</strong> requisitions with a total value of{" "}
              <strong>Tk {formatTaka(selectedTotal)}</strong>.
            </p>

            {error && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">Remarks / Approval Note</label>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">
                Enter MD 4-Digit PIN or Password
              </label>
              <input
                type="password"
                required
                autoFocus
                value={pinOrPassword}
                onChange={(e) => setPinOrPassword(e.target.value)}
                placeholder="••••"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-center font-mono tracking-widest focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !pinOrPassword}
                onClick={handleBatchSubmit}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded shadow disabled:opacity-50"
              >
                {loading ? "Signing..." : "Authenticate & Sign All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
