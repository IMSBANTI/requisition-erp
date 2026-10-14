"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/constants";

interface Props {
  projects: any[];
  companies: any[];
  users: any[];
  isReadOnly: boolean;
}

export default function AdminProjectsClient({ projects, companies, users, isReadOnly }: Props) {
  const [filterCo, setFilterCo] = useState<string>("ALL");
  const [showNewModal, setShowNewModal] = useState(false);

  // Form states for new project
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [category, setCategory] = useState("IMS_OUTSOURCING_STUDIO");
  const [mdApprovalMode, setMdApprovalMode] = useState("INSTANT");
  const [headId, setHeadId] = useState("");
  const [checkerId, setCheckerId] = useState("");
  const [typesStr, setTypesStr] = useState("BPO, ADMIN, CASH");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const filtered = filterCo === "ALL" ? projects : projects.filter((p) => p.companyName === filterCo);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const types = typesStr.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          companyId,
          category,
          mdApprovalMode,
          headId: headId || null,
          checkerId: checkerId || null,
          requisitionTypes: types,
        }),
      });

      if (!res.ok) throw new Error("Failed to create project");
      setMsg("Project created successfully!");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setMsg(err.message || "Error creating project");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {/* Filters and New button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200">
        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-semibold text-gray-500 mr-1">Filter Company:</span>
          <button
            onClick={() => setFilterCo("ALL")}
            className={`px-2.5 py-1 text-xs rounded-md font-semibold border ${
              filterCo === "ALL" ? "bg-red-50 text-[#E42528] border-red-200" : "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            All ({projects.length})
          </button>
          {companies.map((c) => (
            <button
              key={c.code}
              onClick={() => setFilterCo(c.name)}
              className={`px-2.5 py-1 text-xs rounded-md font-semibold border ${
                filterCo === c.name ? "bg-red-50 text-[#E42528] border-red-200" : "bg-gray-50 text-gray-700 border-gray-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow-sm"
          >
            + Create New Project
          </button>
        )}
      </div>

      {/* Projects Table */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">Code / Project Name</th>
                <th className="py-2.5 px-4">Company</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">MD Approval</th>
                <th className="py-2.5 px-4">Tags Allowed</th>
                <th className="py-2.5 px-4">Assigned Head & Checker</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-gray-900 block">{p.name}</span>
                    <span className="text-[11px] font-mono font-semibold text-gray-500">{p.code}</span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-gray-800">{p.companyName}</td>
                  <td className="py-3 px-4 text-gray-700">{p.category}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.mdApprovalMode === "INSTANT"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                      }`}
                    >
                      {p.mdApprovalMode}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {p.requisitionTypes.map((t: string) => (
                        <span key={t} className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-gray-100 border border-gray-200">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[11px]">
                    <span className="text-gray-800 block">Head: <strong>{p.headName}</strong></span>
                    <span className="text-gray-500 block">Checker: {p.checkerName}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900">Create New Project</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure approval workflow and assigned heads for the new project.
            </p>

            {msg && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 text-xs text-blue-800 rounded">
                {msg}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Project Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OUT-25"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Company</label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">Project Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Outsourcing Project 25"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">MD Approval Mode</label>
                  <select
                    value={mdApprovalMode}
                    onChange={(e) => setMdApprovalMode(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="INSTANT">Instant (Direct)</option>
                    <option value="MONTHLY">Monthly Batch</option>
                    <option value="WEEKLY">Weekly Batch</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Project Head</label>
                  <select
                    value={headId}
                    onChange={(e) => setHeadId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="">Default to Dept Head</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Assigned Checker (Optional)</label>
                  <select
                    value={checkerId}
                    onChange={(e) => setCheckerId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Allowed Voucher Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={typesStr}
                  onChange={(e) => setTypesStr(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Save Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
