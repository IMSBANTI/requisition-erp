"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import { formatTaka } from "@/lib/money";

interface ProjectItem {
  id: string;
  code: string;
  name: string;
  companyName: string;
  companyId: string;
  category: string;
  mdApprovalMode: string;
  releaseBeforeMd: boolean;
  requisitionTypes: string[];
  headName: string;
  headId?: string | null;
  checkerName: string;
  checkerId?: string | null;
  directorName: string;
  active: boolean;
  budget?: number;
}

interface Props {
  projects: ProjectItem[];
  companies: any[];
  users: any[];
  isReadOnly: boolean;
}

export default function AdminProjectsClient({ projects, companies, users, isReadOnly }: Props) {
  const [filterCo, setFilterCo] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);

  // Form states for new project
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [category, setCategory] = useState("IMS_OUTSOURCING_STUDIO");
  const [mdApprovalMode, setMdApprovalMode] = useState("INSTANT");
  const [headId, setHeadId] = useState("");
  const [checkerId, setCheckerId] = useState("");
  const [typesStr, setTypesStr] = useState("BPO, ADMIN, CASH");
  const [budget, setBudget] = useState("");

  // Edit form states
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editMdApprovalMode, setEditMdApprovalMode] = useState("INSTANT");
  const [editHeadId, setEditHeadId] = useState("");
  const [editCheckerId, setEditCheckerId] = useState("");
  const [editTypesStr, setEditTypesStr] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editActive, setEditActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const filtered = projects.filter((p) => {
    const matchCompany = filterCo === "ALL" || p.companyName === filterCo;
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase());
    return matchCompany && matchSearch;
  });

  function openEditModal(p: ProjectItem) {
    setEditingProject(p);
    setEditCode(p.code);
    setEditName(p.name);
    setEditCompanyId(p.companyId);
    setEditCategory(p.category);
    setEditMdApprovalMode(p.mdApprovalMode);
    setEditHeadId(p.headId || "");
    setEditCheckerId(p.checkerId || "");
    setEditTypesStr(p.requisitionTypes.join(", "));
    setEditBudget(p.budget ? String(p.budget) : "");
    setEditActive(p.active);
    setMsg("");
    setErrorMsg("");
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErrorMsg("");
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
          budget: budget ? Number(budget) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create project");
      setMsg("Project created successfully!");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || "Error creating project");
      setLoading(false);
    }
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProject) return;
    setLoading(true);
    setMsg("");
    setErrorMsg("");
    try {
      const types = editTypesStr.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const res = await fetch("/api/admin/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProject.id,
          code: editCode,
          name: editName,
          companyId: editCompanyId,
          category: editCategory,
          mdApprovalMode: editMdApprovalMode,
          headId: editHeadId || null,
          checkerId: editCheckerId || null,
          requisitionTypes: types,
          budget: editBudget ? Number(editBudget) : null,
          active: editActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update project");
      setMsg("Project updated successfully!");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || "Error updating project");
      setLoading(false);
    }
  }

  async function handleDeleteProject(p: ProjectItem) {
    const confirmed = window.confirm(
      `Are you sure you want to delete or deactivate project:\n"${p.name} (${p.code})"?\n\nNote: If this project already has requisitions, it will be safely deactivated/archived to protect historical records.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/projects?id=${p.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete project");
      alert(data.message || "Project deleted successfully");
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Error deleting project");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Filters, Search, and New button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500 mr-1">Company:</span>
          <button
            type="button"
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
              type="button"
              onClick={() => setFilterCo(c.name)}
              className={`px-2.5 py-1 text-xs rounded-md font-semibold border ${
                filterCo === c.name ? "bg-red-50 text-[#E42528] border-red-200" : "bg-gray-50 text-gray-700 border-gray-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search project name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 w-52"
          />

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow-sm cursor-pointer whitespace-nowrap"
            >
              + Create New Project
            </button>
          )}
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">Code / Project Name</th>
                <th className="py-2.5 px-4">Company</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Budget</th>
                <th className="py-2.5 px-4">MD Approval</th>
                <th className="py-2.5 px-4">Allowed Tags</th>
                <th className="py-2.5 px-4">Assigned Head & Checker</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                {!isReadOnly && <th className="py-2.5 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-xs text-gray-400">
                    No projects found matching the criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-gray-900 block">{p.name}</span>
                      <span className="text-[11px] font-mono font-semibold text-gray-500">{p.code}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{p.companyName}</td>
                    <td className="py-3 px-4 text-gray-700">{p.category}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-gray-900">
                      {p.budget && p.budget > 0 ? `Tk ${formatTaka(p.budget)}` : "—"}
                    </td>
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
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          p.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {p.active ? "Active" : "Archived"}
                      </span>
                    </td>
                    {!isReadOnly && (
                      <td className="py-3 px-4 text-center whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded border border-gray-300 cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(p)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 cursor-pointer"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Edit Project</h3>
                <p className="text-xs text-gray-500">Update project name, code, budget, and approval chain.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="text-gray-400 hover:text-black font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {msg && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 text-xs text-green-800 rounded">
                {msg}
              </div>
            )}
            {errorMsg && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-xs text-red-800 rounded">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleUpdateProject} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Project Code</label>
                  <input
                    type="text"
                    required
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Company</label>
                  <select
                    value={editCompanyId}
                    onChange={(e) => setEditCompanyId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-semibold"
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
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
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
                    value={editMdApprovalMode}
                    onChange={(e) => setEditMdApprovalMode(e.target.value)}
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
                    value={editHeadId}
                    onChange={(e) => setEditHeadId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="">Default to Dept Head</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.designation})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Assigned Checker (Optional)</label>
                  <select
                    value={editCheckerId}
                    onChange={(e) => setEditCheckerId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.designation})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Budget (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 500000"
                    value={editBudget}
                    onChange={(e) => setEditBudget(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Active Status</label>
                  <select
                    value={editActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) => setEditActive(e.target.value === "ACTIVE")}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Archived / Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Allowed Voucher Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={editTypesStr}
                  onChange={(e) => setEditTypesStr(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-black hover:bg-gray-800 rounded shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-900">Create New Project</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure approval workflow and assigned heads for the new project.
            </p>

            {msg && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 text-xs text-green-800 rounded">
                {msg}
              </div>
            )}
            {errorMsg && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-xs text-red-800 rounded">
                {errorMsg}
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
                        {u.name} ({u.designation})
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
                        {u.name} ({u.designation})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Budget (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 500000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Allowed Voucher Tags
                  </label>
                  <input
                    type="text"
                    value={typesStr}
                    onChange={(e) => setTypesStr(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50 cursor-pointer"
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
