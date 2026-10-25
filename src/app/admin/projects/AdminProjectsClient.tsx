"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/constants";
import { formatTaka } from "@/lib/money";
import {
  CostHeadConfig,
  DEFAULT_PROJECT_COST_HEADS,
  DEFAULT_EVENT_COST_HEADS,
  calculateProfitSummary,
} from "@/lib/profitEngine";

interface ProjectItem {
  id: string;
  code: string;
  name: string;
  companyName: string;
  companyId: string;
  kind?: string;
  category: string;
  mdApprovalMode: string;
  releaseBeforeMd: boolean;
  requisitionTypes: string[];
  headName: string;
  headId?: string | null;
  checkerName: string;
  checkerId?: string | null;
  directorName: string;
  directorId?: string | null;
  active: boolean;
  budget?: number;
  billingProfile?: string;
  feeRate?: number;
  aitRate?: number;
  vatRate?: number;
  billCycleDays?: number;
  funding?: string;
  salaryMonthLag?: number;
  fixedMonthlyBill?: number;
  maintenanceBudget?: number;
  monthlyAmortization?: number;
  varianceThresholdPct?: number;
  costHeads?: CostHeadConfig[];
}

interface Props {
  projects: ProjectItem[];
  companies: any[];
  users: any[];
  isReadOnly: boolean;
}

const PROFILE_BADGES: Record<string, { label: string; color: string }> = {
  COST_PLUS: { label: "COST + FEE", color: "bg-blue-50 text-blue-800 border-blue-200" },
  COST_PLUS_GROSSUP: {
    label: "COST + FEE + AIT GROSS-UP",
    color: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  COMMISSION: { label: "COMMISSION", color: "bg-amber-50 text-amber-800 border-amber-200" },
  FIXED_FEE: { label: "FIXED MONTHLY BILL", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  FIXED_QUOTE: { label: "FIXED EVENT QUOTE", color: "bg-teal-50 text-teal-800 border-teal-200" },
};

export default function AdminProjectsClient({ projects, companies, users, isReadOnly }: Props) {
  const router = useRouter();
  const [projectList, setProjectList] = useState<ProjectItem[]>(projects);

  useEffect(() => {
    setProjectList(projects);
  }, [projects]);

  // Strictly separate Projects vs. Events in two tabs
  const [activeTab, setActiveTab] = useState<"PROJECT" | "EVENT">("PROJECT");
  const [filterCo, setFilterCo] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);

  // Form states for New Project / Event
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [kind, setKind] = useState<"PERMANENT" | "EVENT">("PERMANENT");
  const [category, setCategory] = useState("OUTSOURCING");
  const [mdApprovalMode, setMdApprovalMode] = useState("INSTANT");
  const [headId, setHeadId] = useState("");
  const [checkerId, setCheckerId] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [typesStr, setTypesStr] = useState("BPO, ADMIN, CASH");
  const [budget, setBudget] = useState("");

  // Billing & Calculation states for New Modal
  const [billingProfile, setBillingProfile] = useState("COST_PLUS");
  const [feeRatePct, setFeeRatePct] = useState("8");
  const [aitRatePct, setAitRatePct] = useState("1.2");
  const [vatRatePct, setVatRatePct] = useState("15");
  const [billCycleDays, setBillCycleDays] = useState("30");
  const [funding, setFunding] = useState("POSTPAID");
  const [salaryMonthLag, setSalaryMonthLag] = useState("1");
  const [fixedMonthlyBill, setFixedMonthlyBill] = useState("");
  const [maintenanceBudget, setMaintenanceBudget] = useState("0");
  const [monthlyAmortization, setMonthlyAmortization] = useState("0");
  const [varianceThresholdPct, setVarianceThresholdPct] = useState("10");
  const [costHeads, setCostHeads] = useState<CostHeadConfig[]>(DEFAULT_PROJECT_COST_HEADS);
  const [newHeadName, setNewHeadName] = useState("");
  const [newHeadTag, setNewHeadTag] = useState<"BILLABLE" | "IMS_INVESTMENT">("BILLABLE");

  // Edit form states
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editKind, setEditKind] = useState<"PERMANENT" | "EVENT">("PERMANENT");
  const [editCategory, setEditCategory] = useState("");
  const [editMdApprovalMode, setEditMdApprovalMode] = useState("INSTANT");
  const [editHeadId, setEditHeadId] = useState("");
  const [editCheckerId, setEditCheckerId] = useState("");
  const [editDirectorId, setEditDirectorId] = useState("");
  const [editTypesStr, setEditTypesStr] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Edit Billing & Calculation states
  const [editBillingProfile, setEditBillingProfile] = useState("COST_PLUS");
  const [editFeeRatePct, setEditFeeRatePct] = useState("8");
  const [editAitRatePct, setEditAitRatePct] = useState("1.2");
  const [editVatRatePct, setEditVatRatePct] = useState("15");
  const [editBillCycleDays, setEditBillCycleDays] = useState("30");
  const [editFunding, setEditFunding] = useState("POSTPAID");
  const [editSalaryMonthLag, setEditSalaryMonthLag] = useState("1");
  const [editFixedMonthlyBill, setEditFixedMonthlyBill] = useState("");
  const [editMaintenanceBudget, setEditMaintenanceBudget] = useState("0");
  const [editMonthlyAmortization, setEditMonthlyAmortization] = useState("0");
  const [editVarianceThresholdPct, setEditVarianceThresholdPct] = useState("10");
  const [editCostHeads, setEditCostHeads] = useState<CostHeadConfig[]>(DEFAULT_PROJECT_COST_HEADS);
  const [editNewHeadName, setEditNewHeadName] = useState("");
  const [editNewHeadTag, setEditNewHeadTag] = useState<"BILLABLE" | "IMS_INVESTMENT">("BILLABLE");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const projectsOnly = useMemo(
    () =>
      projectList.filter(
        (p) => p.kind !== "EVENT" && !p.code?.toUpperCase().startsWith("EVT-")
      ),
    [projectList]
  );

  const eventsOnly = useMemo(
    () =>
      projectList.filter(
        (p) => p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-")
      ),
    [projectList]
  );

  const currentTabList = activeTab === "EVENT" ? eventsOnly : projectsOnly;

  const filtered = currentTabList.filter((p) => {
    const matchCompany = filterCo === "ALL" || p.companyName === filterCo;
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase());
    return matchCompany && matchSearch;
  });

  function openNewModalForTab(tab: "PROJECT" | "EVENT") {
    const isEvt = tab === "EVENT";
    setKind(isEvt ? "EVENT" : "PERMANENT");
    setCode(isEvt ? "EVT-" : "PROJ-");
    setName("");
    setCategory(isEvt ? "OPERATIONS_EVENT" : "OUTSOURCING");
    setTypesStr(isEvt ? "EVENT, CASH, ADMIN" : "BPO, ADMIN, CASH");
    setMdApprovalMode(isEvt ? "INSTANT" : "MONTHLY");
    setBillingProfile(isEvt ? "FIXED_QUOTE" : "COST_PLUS");
    setFeeRatePct(isEvt ? "10" : "8");
    setAitRatePct(isEvt ? "2" : "1.2");
    setVatRatePct("15");
    setBillCycleDays("30");
    setFunding("POSTPAID");
    setSalaryMonthLag(isEvt ? "0" : "1");
    setFixedMonthlyBill("");
    setMaintenanceBudget("0");
    setMonthlyAmortization("0");
    setVarianceThresholdPct("10");
    setCostHeads(isEvt ? DEFAULT_EVENT_COST_HEADS : DEFAULT_PROJECT_COST_HEADS);
    setMsg("");
    setErrorMsg("");
    setShowNewModal(true);
  }

  function openEditModal(p: ProjectItem) {
    const isEvt = p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-");
    setEditingProject(p);
    setEditCode(p.code);
    setEditName(p.name);
    setEditCompanyId(p.companyId);
    setEditKind(isEvt ? "EVENT" : "PERMANENT");
    setEditCategory(p.category === "IMS_OUTSOURCING_STUDIO" ? "OUTSOURCING" : p.category);
    setEditMdApprovalMode(p.mdApprovalMode);
    setEditHeadId(p.headId || "");
    setEditCheckerId(p.checkerId || "");
    setEditDirectorId(p.directorId || "");
    setEditTypesStr(p.requisitionTypes.join(", "));
    setEditBudget(p.budget ? String(p.budget) : "");
    setEditActive(p.active);

    setEditBillingProfile(p.billingProfile || (isEvt ? "COST_PLUS" : "COST_PLUS"));
    const fRate = p.feeRate !== undefined ? (p.feeRate <= 1 ? p.feeRate * 100 : p.feeRate) : 8;
    const aRate = p.aitRate !== undefined ? (p.aitRate <= 1 ? p.aitRate * 100 : p.aitRate) : 1.2;
    const vRate = p.vatRate !== undefined ? (p.vatRate <= 1 ? p.vatRate * 100 : p.vatRate) : 15;
    setEditFeeRatePct(String(Number(fRate.toFixed(2))));
    setEditAitRatePct(String(Number(aRate.toFixed(2))));
    setEditVatRatePct(String(Number(vRate.toFixed(2))));
    setEditBillCycleDays(String(p.billCycleDays ?? 30));
    setEditFunding(p.funding || "POSTPAID");
    setEditSalaryMonthLag(String(p.salaryMonthLag ?? (isEvt ? 0 : 1)));
    setEditFixedMonthlyBill(p.fixedMonthlyBill ? String(p.fixedMonthlyBill) : "");
    setEditMaintenanceBudget(String(p.maintenanceBudget ?? 0));
    setEditMonthlyAmortization(String(p.monthlyAmortization ?? 0));
    setEditVarianceThresholdPct(String(p.varianceThresholdPct ?? 10));
    setEditCostHeads(
      Array.isArray(p.costHeads) && p.costHeads.length > 0
        ? p.costHeads
        : isEvt
        ? DEFAULT_EVENT_COST_HEADS
        : DEFAULT_PROJECT_COST_HEADS
    );
    setMsg("");
    setErrorMsg("");
  }

  // Live simulation preview inside Edit modal
  const editPreview = useMemo(() => {
    const sampleBillable =
      editBillingProfile === "FIXED_FEE"
        ? 0
        : editBillingProfile === "FIXED_QUOTE"
        ? Number(editBudget) || 800000
        : 1000000;
    const sampleImsInv = editBillingProfile === "FIXED_FEE" ? 0 : 25000;
    return calculateProfitSummary({
      terms: {
        billingProfile: editBillingProfile,
        feeRate: (parseFloat(editFeeRatePct) || 0) / 100,
        aitRate: (parseFloat(editAitRatePct) || 0) / 100,
        vatRate: (parseFloat(editVatRatePct) || 0) / 100,
        fixedMonthlyBill: parseFloat(editFixedMonthlyBill) || 0,
        maintenanceBudget: parseFloat(editMaintenanceBudget) || 0,
        monthlyAmortization: parseFloat(editMonthlyAmortization) || 0,
      },
      billableCost: sampleBillable,
      imsInvestment: sampleImsInv,
    });
  }, [
    editBillingProfile,
    editFeeRatePct,
    editAitRatePct,
    editVatRatePct,
    editFixedMonthlyBill,
    editMaintenanceBudget,
    editMonthlyAmortization,
    editBudget,
  ]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErrorMsg("");
    try {
      const types = typesStr
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          companyId,
          kind,
          category,
          mdApprovalMode,
          headId: headId || null,
          checkerId: checkerId || null,
          directorId: directorId || null,
          requisitionTypes: types,
          budget: budget ? Number(budget) : null,
          billingProfile,
          feeRate: (parseFloat(feeRatePct) || 0) / 100,
          aitRate: (parseFloat(aitRatePct) || 0) / 100,
          vatRate: (parseFloat(vatRatePct) || 0) / 100,
          billCycleDays: parseInt(billCycleDays, 10) || 30,
          funding,
          salaryMonthLag: parseInt(salaryMonthLag, 10) || 0,
          fixedMonthlyBill: fixedMonthlyBill ? Number(fixedMonthlyBill) : null,
          maintenanceBudget: maintenanceBudget ? Number(maintenanceBudget) : 0,
          monthlyAmortization: monthlyAmortization ? Number(monthlyAmortization) : 0,
          varianceThresholdPct: parseFloat(varianceThresholdPct) || 10,
          costHeads,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      setMsg(`${kind === "EVENT" ? "Event" : "Project"} created successfully!`);
      router.refresh();
      setTimeout(() => {
        setShowNewModal(false);
        setLoading(false);
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || "Error creating");
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
      const types = editTypesStr
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const res = await fetch("/api/admin/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProject.id,
          code: editCode,
          name: editName,
          companyId: editCompanyId,
          kind: editKind,
          category: editCategory,
          mdApprovalMode: editMdApprovalMode,
          headId: editHeadId || null,
          checkerId: editCheckerId || null,
          directorId: editDirectorId || null,
          requisitionTypes: types,
          budget: editBudget ? Number(editBudget) : null,
          active: editActive,
          billingProfile: editBillingProfile,
          feeRate: (parseFloat(editFeeRatePct) || 0) / 100,
          aitRate: (parseFloat(editAitRatePct) || 0) / 100,
          vatRate: (parseFloat(editVatRatePct) || 0) / 100,
          billCycleDays: parseInt(editBillCycleDays, 10) || 30,
          funding: editFunding,
          salaryMonthLag: parseInt(editSalaryMonthLag, 10) || 0,
          fixedMonthlyBill: editFixedMonthlyBill ? Number(editFixedMonthlyBill) : null,
          maintenanceBudget: editMaintenanceBudget ? Number(editMaintenanceBudget) : 0,
          monthlyAmortization: editMonthlyAmortization ? Number(editMonthlyAmortization) : 0,
          varianceThresholdPct: parseFloat(editVarianceThresholdPct) || 10,
          costHeads: editCostHeads,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setMsg("Saved successfully!");
      router.refresh();
      setTimeout(() => {
        setEditingProject(null);
        setLoading(false);
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || "Error updating");
      setLoading(false);
    }
  }

  async function handleDeleteProject(p: ProjectItem) {
    const label = p.kind === "EVENT" ? "event" : "project";
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${label}:\n"${p.name} (${p.code})"?`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/projects?id=${p.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setProjectList((prev) => prev.filter((item) => item.id !== p.id));
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Error deleting");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Top Directory Tabs: Strict separation between Projects and Events */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
        <div className="inline-flex rounded-lg p-1 bg-gray-100 border border-gray-200 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("PROJECT")}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "PROJECT"
                ? "bg-gray-900 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            📁 Projects ({projectsOnly.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("EVENT")}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "EVENT"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            🎪 Events ({eventsOnly.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-semibold text-gray-500 mr-1">Company:</span>
            <button
              type="button"
              onClick={() => setFilterCo("ALL")}
              className={`px-2.5 py-1 text-xs rounded-md font-semibold border ${
                filterCo === "ALL"
                  ? "bg-red-50 text-[#E42528] border-red-200"
                  : "bg-gray-50 text-gray-700 border-gray-200"
              }`}
            >
              All ({currentTabList.length})
            </button>
            {companies.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setFilterCo(c.name)}
                className={`px-2.5 py-1 text-xs rounded-md font-semibold border ${
                  filterCo === c.name
                    ? "bg-red-50 text-[#E42528] border-red-200"
                    : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder={`Search ${activeTab === "EVENT" ? "event" : "project"}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 w-48"
          />

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => openNewModalForTab(activeTab)}
              className={`px-3.5 py-1.5 text-xs font-bold text-white rounded-md shadow-sm cursor-pointer whitespace-nowrap ${
                activeTab === "EVENT"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-[#E42528] hover:bg-[#B81D20]"
              }`}
            >
              {activeTab === "EVENT" ? "+ Create New Event" : "+ Create New Project"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">
                  {activeTab === "EVENT" ? "Code / Event Name" : "Code / Project Name"}
                </th>
                <th className="py-2.5 px-4">Company</th>
                <th className="py-2.5 px-4">Billing Profile & Terms</th>
                <th className="py-2.5 px-4 text-right">
                  {activeTab === "EVENT" ? "Event Budget / Quote" : "Monthly Budget / Fixed Bill"}
                </th>
                <th className="py-2.5 px-4">Cost Heads</th>
                <th className="py-2.5 px-4">Assigned Head & Director</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                {!isReadOnly && <th className="py-2.5 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-gray-400">
                    No {activeTab === "EVENT" ? "events" : "projects"} found matching the criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const prof = p.billingProfile || "COST_PLUS";
                  const badge = PROFILE_BADGES[prof] || PROFILE_BADGES.COST_PLUS;
                  const fPct =
                    p.feeRate !== undefined
                      ? p.feeRate <= 1
                        ? (p.feeRate * 100).toFixed(1)
                        : p.feeRate.toFixed(1)
                      : "8.0";
                  const aPct =
                    p.aitRate !== undefined
                      ? p.aitRate <= 1
                        ? (p.aitRate * 100).toFixed(1)
                        : p.aitRate.toFixed(1)
                      : "1.2";
                  const vPct =
                    p.vatRate !== undefined
                      ? p.vatRate <= 1
                        ? (p.vatRate * 100).toFixed(0)
                        : p.vatRate.toFixed(0)
                      : "15";
                  const billableCount = (p.costHeads || []).filter(
                    (h) => h.tag === "BILLABLE"
                  ).length;
                  const invCount = (p.costHeads || []).filter(
                    (h) => h.tag === "IMS_INVESTMENT"
                  ).length;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-gray-900 block">{p.name}</span>
                        <span className="text-[11px] font-mono font-semibold text-gray-500">
                          {p.code} &bull; {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800">{p.companyName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                        <div className="text-[11px] text-gray-600 mt-1 font-mono">
                          {prof !== "FIXED_FEE" && prof !== "FIXED_QUOTE" && (
                            <span>Fee: <strong>{fPct}%</strong> &bull; </span>
                          )}
                          <span>AIT: <strong>{aPct}%</strong> &bull; </span>
                          <span>VAT: <strong>{vPct}%</strong></span>
                          {p.billCycleDays !== undefined && (
                            <span className="text-gray-400"> ({p.billCycleDays}d)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-gray-900">
                        {p.fixedMonthlyBill && p.fixedMonthlyBill > 0 ? (
                          <div>
                            <span className="text-emerald-700 font-bold">
                              Bill: Tk {formatTaka(p.fixedMonthlyBill)}
                            </span>
                            {p.budget && p.budget > 0 ? (
                              <span className="block text-[10px] text-gray-500">
                                Budget: Tk {formatTaka(p.budget)}
                              </span>
                            ) : null}
                          </div>
                        ) : p.budget && p.budget > 0 ? (
                          `Tk ${formatTaka(p.budget)}`
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-[11px]">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-green-50 text-green-800 border border-green-200 font-semibold mr-1">
                          {billableCount} Billable
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                          {invCount} IMS Inv.
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px]">
                        <span className="text-gray-800 block">
                          Head: <strong>{p.headName}</strong>
                        </span>
                        <span className="text-gray-500 block">Checker: {p.checkerName}</span>
                        <span className="text-gray-500 block">
                          Director: <strong>{p.directorName}</strong>
                        </span>
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
                            className="px-2.5 py-1 text-[11px] font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded cursor-pointer"
                          >
                            ⚙️ Setup & Billing
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProject(p)}
                            className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 cursor-pointer"
                          >
                            🗑️
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

      {/* Edit Project / Event Setup & Billing Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 border border-gray-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {editKind === "EVENT"
                    ? `🎪 Event Setup, Billing & Cost Heads — ${editingProject.name}`
                    : `📁 Project Setup, Billing & Cost Heads — ${editingProject.name}`}
                </h3>
                <p className="text-xs text-gray-500">
                  Configure workflow approvers, billing formula (Fee, AIT, VAT), and Cost Heads (Billable vs IMS Investment).
                </p>
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

            <form onSubmit={handleUpdateProject} className="mt-4 space-y-5">
              {/* Section 1: Basic Info & Workflow */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  1. General Details & Approval Chain
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Code</label>
                    <input
                      type="text"
                      required
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700">Full Name</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Company</label>
                    <select
                      value={editCompanyId}
                      onChange={(e) => setEditCompanyId(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-semibold bg-white"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Classification</label>
                    <select
                      value={editKind}
                      onChange={(e) => setEditKind(e.target.value as "PERMANENT" | "EVENT")}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                    >
                      <option value="PERMANENT">📁 Project (Regular / Monthly)</option>
                      <option value="EVENT">🎪 Event / Activation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
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
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                    >
                      <option value="INSTANT">Instant (Direct)</option>
                      <option value="MONTHLY">Monthly Batch</option>
                      <option value="WEEKLY">Weekly Batch</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Status</label>
                    <select
                      value={editActive ? "ACTIVE" : "INACTIVE"}
                      onChange={(e) => setEditActive(e.target.value === "ACTIVE")}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Archived / Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Assigned Head</label>
                    <select
                      value={editHeadId}
                      onChange={(e) => setEditHeadId(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
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
                    <label className="block text-xs font-semibold text-gray-700">Checker (Optional)</label>
                    <select
                      value={editCheckerId}
                      onChange={(e) => setEditCheckerId(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                    >
                      <option value="">None</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Director</label>
                    <select
                      value={editDirectorId}
                      onChange={(e) => setEditDirectorId(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                    >
                      <option value="">Auto (Category Director)</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Allowed Tags</label>
                    <input
                      type="text"
                      value={editTypesStr}
                      onChange={(e) => setEditTypesStr(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Billing & Profit Formula Terms */}
              <div className="p-4 bg-blue-50/40 rounded-lg border border-blue-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    2. {editKind === "EVENT" ? "Event" : "Project"} Billing Profile & Profit Formula
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    Used to calculate Client Bill (Ex-VAT & With VAT), AIT, Expected Inflow & Net Profit on Requisitions
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700">Billing Profile</label>
                    <select
                      value={editBillingProfile}
                      onChange={(e) => setEditBillingProfile(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                    >
                      <option value="COST_PLUS">
                        COST_PLUS — Billable Cost + Fee % (e.g., UBL CM 8%)
                      </option>
                      <option value="COST_PLUS_GROSSUP">
                        COST_PLUS_GROSSUP — Cost + Fee % + AIT Grossed Up into Bill (e.g., Robi 4.5% + 2% AIT)
                      </option>
                      {editKind !== "EVENT" && (
                        <option value="COMMISSION">
                          COMMISSION — Pass-Through Cost + Commission % (AIT on Commission only, e.g., RSO)
                        </option>
                      )}
                      {editKind !== "EVENT" ? (
                        <option value="FIXED_FEE">
                          FIXED_FEE — Fixed Monthly Client Bill (e.g., DBH Office Setup)
                        </option>
                      ) : (
                        <option value="FIXED_QUOTE">
                          FIXED_QUOTE — Fixed Client Event PO / Package Amount (Ex-VAT)
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {editBillingProfile === "COMMISSION"
                        ? "Commission Rate (%)"
                        : editKind === "EVENT"
                        ? "Agency Fee (%)"
                        : "Management Fee (%)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFeeRatePct}
                      onChange={(e) => setEditFeeRatePct(e.target.value)}
                      disabled={editBillingProfile === "FIXED_FEE" || editBillingProfile === "FIXED_QUOTE"}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700">AIT Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editAitRatePct}
                      onChange={(e) => setEditAitRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">VAT Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editVatRatePct}
                      onChange={(e) => setEditVatRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Bill Cycle (Days)</label>
                    <select
                      value={editBillCycleDays}
                      onChange={(e) => setEditBillCycleDays(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                    >
                      <option value="0">0 days (Prepaid / Immediate)</option>
                      <option value="15">15 days</option>
                      <option value="30">30 days</option>
                      <option value="45">45 days</option>
                      <option value="60">60 days</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Funding Mode</label>
                    <select
                      value={editFunding}
                      onChange={(e) => setEditFunding(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                    >
                      <option value="POSTPAID">Postpaid (IMS funds first)</option>
                      <option value="PREPAID">Prepaid (Client advances)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {editKind === "EVENT" ? "Approved Event Budget (BDT)" : "Monthly Target Budget (BDT)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 500000"
                      value={editBudget}
                      onChange={(e) => setEditBudget(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                {/* Extra fields for FIXED_FEE / FIXED_QUOTE or Project Variance */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {editKind === "EVENT"
                        ? "Fixed Event Client PO Ex-VAT (BDT)"
                        : "Fixed Monthly Bill Ex-VAT (BDT)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={
                        editBillingProfile === "FIXED_FEE" || editBillingProfile === "FIXED_QUOTE"
                          ? "Required for Fixed Bill"
                          : "Optional"
                      }
                      value={editFixedMonthlyBill}
                      onChange={(e) => setEditFixedMonthlyBill(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>

                  {editKind !== "EVENT" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">
                          Salary Month Lag (0 or 1)
                        </label>
                        <select
                          value={editSalaryMonthLag}
                          onChange={(e) => setEditSalaryMonthLag(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                        >
                          <option value="1">1 Month Lag (Prev month salary)</option>
                          <option value="0">0 Lag (Same month salary)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">
                          Monthly Amortization + CoF (BDT)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editMonthlyAmortization}
                          onChange={(e) => setEditMonthlyAmortization(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      Variance Reason Threshold (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={editVarianceThresholdPct}
                      onChange={(e) => setEditVarianceThresholdPct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                {/* Live Formula Simulation Bar */}
                <div className="mt-2 p-3 bg-white rounded-lg border border-blue-200 grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
                  <div>
                    <span className="text-gray-400 block">Sample Billable</span>
                    <span className="font-mono font-bold text-gray-800">
                      Tk {formatTaka(editPreview.billableCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Bill (Ex-VAT)</span>
                    <span className="font-mono font-bold text-gray-900">
                      Tk {formatTaka(editPreview.billExVat)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">VAT ({editPreview.vatRatePct}%)</span>
                    <span className="font-mono font-semibold text-gray-600">
                      Tk {formatTaka(editPreview.vatAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Bill With VAT</span>
                    <span className="font-mono font-bold text-blue-700">
                      Tk {formatTaka(editPreview.billWithVat)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">AIT ({editPreview.aitRatePct}%)</span>
                    <span className="font-mono font-semibold text-amber-700">
                      -Tk {formatTaka(editPreview.aitDeducted)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Projected Net Profit</span>
                    <span
                      className={`font-mono font-extrabold ${
                        editPreview.netProfit >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      Tk {formatTaka(editPreview.netProfit)} ({editPreview.netMarginPct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: Cost Heads (BILLABLE vs IMS_INVESTMENT) */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      3. Configured Cost Heads (BILLABLE vs. IMS_INVESTMENT)
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      Requisition lines under this {editKind === "EVENT" ? "Event" : "Project"} use these Cost Heads to separate Client-Billable costs from IMS Investment costs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditCostHeads(
                        editKind === "EVENT" ? DEFAULT_EVENT_COST_HEADS : DEFAULT_PROJECT_COST_HEADS
                      )
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
                  >
                    ↺ Reset to Default {editKind === "EVENT" ? "Event" : "Project"} Cost Heads
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {editCostHeads.map((ch, idx) => (
                    <div
                      key={ch.id || idx}
                      className="flex items-center justify-between px-3 py-1.5 bg-white rounded border border-gray-200 text-xs"
                    >
                      <span className="font-medium text-gray-900 truncate mr-2">{ch.name}</span>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...editCostHeads];
                            updated[idx] = {
                              ...updated[idx],
                              tag: updated[idx].tag === "BILLABLE" ? "IMS_INVESTMENT" : "BILLABLE",
                            };
                            setEditCostHeads(updated);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border ${
                            ch.tag === "BILLABLE"
                              ? "bg-green-50 text-green-800 border-green-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                          title="Click to toggle between BILLABLE and IMS_INVESTMENT"
                        >
                          {ch.tag}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditCostHeads(editCostHeads.filter((_, i) => i !== idx))
                          }
                          className="text-gray-400 hover:text-red-600 font-bold px-1 cursor-pointer"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new cost head */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add custom Cost Head name..."
                    value={editNewHeadName}
                    onChange={(e) => setEditNewHeadName(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white flex-1 min-w-[200px]"
                  />
                  <select
                    value={editNewHeadTag}
                    onChange={(e) =>
                      setEditNewHeadTag(e.target.value as "BILLABLE" | "IMS_INVESTMENT")
                    }
                    className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                  >
                    <option value="BILLABLE">BILLABLE (Client Billed)</option>
                    <option value="IMS_INVESTMENT">IMS_INVESTMENT (IMS Cost)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editNewHeadName.trim()) return;
                      setEditCostHeads([
                        ...editCostHeads,
                        {
                          id: `custom_${Date.now()}`,
                          name: editNewHeadName.trim(),
                          tag: editNewHeadTag,
                        },
                      ]);
                      setEditNewHeadName("");
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-md cursor-pointer"
                  >
                    + Add Cost Head
                  </button>
                </div>
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
                  className="px-5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Project / Event Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 border border-gray-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {kind === "EVENT" ? "🎪 Create New Event" : "📁 Create New Project"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure workflow approvers, billing profile, and cost heads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
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

            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">
                    {kind === "EVENT" ? "Event Code" : "Project Code"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={kind === "EVENT" ? "e.g. EVT-ROBI-26" : "e.g. PROJ-ROBI"}
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
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-semibold"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Classification</label>
                  <select
                    value={kind}
                    onChange={(e) => {
                      const val = e.target.value as "PERMANENT" | "EVENT";
                      setKind(val);
                      if (val === "EVENT") {
                        setCategory("OPERATIONS_EVENT");
                        setTypesStr("EVENT, CASH, ADMIN");
                        setBillingProfile("FIXED_QUOTE");
                        setCostHeads(DEFAULT_EVENT_COST_HEADS);
                      } else {
                        setCategory("OUTSOURCING");
                        setTypesStr("BPO, ADMIN, CASH");
                        setBillingProfile("COST_PLUS");
                        setCostHeads(DEFAULT_PROJECT_COST_HEADS);
                      }
                    }}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold"
                  >
                    <option value="PERMANENT">📁 Project (Regular / Monthly)</option>
                    <option value="EVENT">🎪 Event / Activation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  {kind === "EVENT" ? "Event Full Name" : "Project Full Name"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    kind === "EVENT" ? "e.g. Event — Robi Campus Activation" : "e.g. Project Robi SME"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Head</label>
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
                  <label className="block text-xs font-semibold text-gray-700">Checker (Optional)</label>
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
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Director</label>
                  <select
                    value={directorId}
                    onChange={(e) => setDirectorId(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs"
                  >
                    <option value="">Auto (Category Director)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Billing Profile in New Modal */}
              <div className="p-3.5 bg-blue-50/50 rounded-lg border border-blue-200 space-y-3">
                <h4 className="text-xs font-bold text-gray-900">
                  Billing Profile & Profit Calculation Terms
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700">Billing Model</label>
                    <select
                      value={billingProfile}
                      onChange={(e) => setBillingProfile(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                    >
                      <option value="COST_PLUS">COST_PLUS (Billable Cost + Fee %)</option>
                      <option value="COST_PLUS_GROSSUP">
                        COST_PLUS_GROSSUP (Cost + Fee % + AIT Gross-up)
                      </option>
                      {kind !== "EVENT" && (
                        <option value="COMMISSION">COMMISSION (Pass-through + Commission %)</option>
                      )}
                      {kind !== "EVENT" ? (
                        <option value="FIXED_FEE">FIXED_FEE (Fixed Monthly Client Bill)</option>
                      ) : (
                        <option value="FIXED_QUOTE">FIXED_QUOTE (Fixed Event PO Ex-VAT)</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Fee / Comm (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={feeRatePct}
                      onChange={(e) => setFeeRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">AIT (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={aitRatePct}
                      onChange={(e) => setAitRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {kind === "EVENT" ? "Approved Event Budget (BDT)" : "Monthly Target Budget (BDT)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 500000"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {kind === "EVENT" ? "Fixed Event Client PO Ex-VAT" : "Fixed Monthly Bill Ex-VAT"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="If Fixed Fee / Quote"
                      value={fixedMonthlyBill}
                      onChange={(e) => setFixedMonthlyBill(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Allowed Voucher Tags</label>
                    <input
                      type="text"
                      value={typesStr}
                      onChange={(e) => setTypesStr(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
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
                  {loading ? "Creating..." : kind === "EVENT" ? "Save Event" : "Save Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
