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
  aitGrossupRate?: number;
  vatRate?: number;
  billCycleDays?: number;
  funding?: string;
  salaryMonthLag?: number;
  fixedMonthlyBill?: number;
  maintenanceBudget?: number;
  monthlyAmortization?: number;
  varianceThresholdPct?: number;
  costHeads?: CostHeadConfig[];
  stepThresholds?: {
    HEAD?: number;
    CHECKER?: number;
    ACCOUNTS?: number;
    DIRECTOR?: number;
    MD?: number;
  };
}

interface Props {
  projects: ProjectItem[];
  companies: any[];
  users: any[];
  currentUserId?: string;
  isSuperAdmin?: boolean;
  canCreateProject?: boolean;
  isReadOnly: boolean;
}

const PROFILE_BADGES: Record<string, { label: string; color: string }> = {
  COST_PLUS: { label: "Cost + fee", color: "bg-blue-50 text-blue-800 border-blue-200" },
  COST_PLUS_GROSSUP: {
    label: "Cost + fee + AIT gross-up",
    color: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  COMMISSION: { label: "Commission", color: "bg-amber-50 text-amber-800 border-amber-200" },
  FIXED_FEE: { label: "Fixed monthly fee", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  FIXED_QUOTE: { label: "Fixed quote", color: "bg-teal-50 text-teal-800 border-teal-200" },
};

export default function AdminProjectsClient({
  projects,
  companies,
  users,
  currentUserId = "",
  isSuperAdmin = false,
  canCreateProject = false,
}: Props) {
  const router = useRouter();
  const [projectList, setProjectList] = useState<ProjectItem[]>(projects);

  useEffect(() => {
    setProjectList(projects);
  }, [projects]);

  function canEditProjectItem(p: ProjectItem | null): boolean {
    if (!p) return false;
    if (isSuperAdmin) return true;
    if (currentUserId && p.headId === currentUserId) return true;
    return false;
  }

  const [activeTab, setActiveTab] = useState<"PROJECT" | "EVENT">("PROJECT");
  const [filterCo, setFilterCo] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);

  // Sub-tabs inside Edit / New Modals to eliminate clutter
  const [modalTab, setModalTab] = useState<"BASICS" | "BILLING" | "COST_HEADS">("BASICS");
  const [showAdvancedWorkflow, setShowAdvancedWorkflow] = useState(false);
  const [showAdvancedBilling, setShowAdvancedBilling] = useState(false);

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
  const [aitGrossupRatePct, setAitGrossupRatePct] = useState("2");
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
  const [editAitGrossupRatePct, setEditAitGrossupRatePct] = useState("2");
  const [editVatRatePct, setEditAitVatRatePct] = useState("15");
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
  const [editNewHeadAliases, setEditNewHeadAliases] = useState("");

  // Approval Step Minimum Amount Thresholds
  const [editHeadMinAmt, setEditHeadMinAmt] = useState("0");
  const [editCheckerMinAmt, setEditCheckerMinAmt] = useState("0");
  const [editAccountsMinAmt, setEditAccountsMinAmt] = useState("0");
  const [editDirectorMinAmt, setEditDirectorMinAmt] = useState("0");
  const [editMdMinAmt, setEditMdMinAmt] = useState("0");

  // Interactive Live Profit Simulator override inputs in Edit/View Modal
  const [simBillableInput, setSimBillableInput] = useState("");
  const [simImsInput, setSimImsInput] = useState("");

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
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.headName?.toLowerCase().includes(search.toLowerCase());
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
    setHeadId(isSuperAdmin ? "" : currentUserId || "");
    setBillingProfile(isEvt ? "FIXED_QUOTE" : "COST_PLUS");
    setFeeRatePct(isEvt ? "10" : "8");
    setAitRatePct(isEvt ? "2" : "1.2");
    setAitGrossupRatePct("2");
    setVatRatePct("15");
    setBillCycleDays("30");
    setFunding("POSTPAID");
    setSalaryMonthLag(isEvt ? "0" : "1");
    setFixedMonthlyBill("");
    setMaintenanceBudget("0");
    setMonthlyAmortization("0");
    setVarianceThresholdPct("10");
    setCostHeads(isEvt ? DEFAULT_EVENT_COST_HEADS : DEFAULT_PROJECT_COST_HEADS);
    setModalTab("BASICS");
    setShowAdvancedWorkflow(false);
    setShowAdvancedBilling(false);
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
    const gRate =
      p.aitGrossupRate !== undefined
        ? p.aitGrossupRate <= 1
          ? p.aitGrossupRate * 100
          : p.aitGrossupRate
        : aRate;
    const vRate = p.vatRate !== undefined ? (p.vatRate <= 1 ? p.vatRate * 100 : p.vatRate) : 15;
    setEditFeeRatePct(String(Number(fRate.toFixed(2))));
    setEditAitRatePct(String(Number(aRate.toFixed(2))));
    setEditAitGrossupRatePct(String(Number(gRate.toFixed(2))));
    setEditAitVatRatePct(String(Number(vRate.toFixed(2))));
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
    setEditHeadMinAmt(String(p.stepThresholds?.HEAD ?? 0));
    setEditCheckerMinAmt(String(p.stepThresholds?.CHECKER ?? 0));
    setEditAccountsMinAmt(String(p.stepThresholds?.ACCOUNTS ?? 0));
    setEditDirectorMinAmt(String(p.stepThresholds?.DIRECTOR ?? 0));
    setEditMdMinAmt(String(p.stepThresholds?.MD ?? 0));
    setSimBillableInput("");
    setSimImsInput("");
    setModalTab("BASICS");
    setShowAdvancedWorkflow(false);
    setShowAdvancedBilling(false);
    setMsg("");
    setErrorMsg("");
  }

  const editPreview = useMemo(() => {
    const defaultBillable =
      editBillingProfile === "FIXED_FEE"
        ? 0
        : editBillingProfile === "FIXED_QUOTE"
        ? Number(editBudget) || 800000
        : 1000000;
    const defaultImsInv = editBillingProfile === "FIXED_FEE" ? 0 : 25000;
    const sampleBillable =
      simBillableInput !== "" ? Math.max(0, parseFloat(simBillableInput) || 0) : defaultBillable;
    const sampleImsInv =
      simImsInput !== "" ? Math.max(0, parseFloat(simImsInput) || 0) : defaultImsInv;
    return calculateProfitSummary({
      terms: {
        billingProfile: editBillingProfile,
        feeRate: (parseFloat(editFeeRatePct) || 0) / 100,
        aitRate: (parseFloat(editAitRatePct) || 0) / 100,
        aitGrossupRate:
          editBillingProfile === "COST_PLUS_GROSSUP"
            ? (parseFloat(editAitGrossupRatePct) || 0) / 100
            : undefined,
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
    editAitGrossupRatePct,
    editVatRatePct,
    editFixedMonthlyBill,
    editMaintenanceBudget,
    editMonthlyAmortization,
    editBudget,
    simBillableInput,
    simImsInput,
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
          ...(billingProfile === "COST_PLUS_GROSSUP"
            ? { aitGrossupRate: (parseFloat(aitGrossupRatePct) || 0) / 100 }
            : {}),
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
          aitGrossupRate:
            editBillingProfile === "COST_PLUS_GROSSUP"
              ? (parseFloat(editAitGrossupRatePct) || 0) / 100
              : null,
          vatRate: (parseFloat(editVatRatePct) || 0) / 100,
          billCycleDays: parseInt(editBillCycleDays, 10) || 30,
          funding: editFunding,
          salaryMonthLag: parseInt(editSalaryMonthLag, 10) || 0,
          fixedMonthlyBill: editFixedMonthlyBill ? Number(editFixedMonthlyBill) : null,
          maintenanceBudget: editMaintenanceBudget ? Number(editMaintenanceBudget) : 0,
          monthlyAmortization: editMonthlyAmortization ? Number(editMonthlyAmortization) : 0,
          varianceThresholdPct: parseFloat(editVarianceThresholdPct) || 10,
          costHeads: editCostHeads,
          stepThresholds: {
            HEAD: Math.max(0, parseFloat(editHeadMinAmt) || 0),
            CHECKER: Math.max(0, parseFloat(editCheckerMinAmt) || 0),
            ACCOUNTS: Math.max(0, parseFloat(editAccountsMinAmt) || 0),
            DIRECTOR: Math.max(0, parseFloat(editDirectorMinAmt) || 0),
            MD: Math.max(0, parseFloat(editMdMinAmt) || 0),
          },
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
      {/* Compact Single-Line Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-xs">
        <div className="inline-flex rounded-lg p-1 bg-gray-100 border border-gray-200 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("PROJECT")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
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
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeTab === "EVENT"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            🎪 Events ({eventsOnly.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterCo}
            onChange={(e) => setFilterCo(e.target.value)}
            className="text-xs font-semibold border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-800"
          >
            <option value="ALL">All Companies ({currentTabList.length})</option>
            {companies.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder={`Search ${activeTab === "EVENT" ? "event" : "project"} or head...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2.5 py-1.5 w-48 sm:w-56"
          />

          {canCreateProject && (
            <button
              type="button"
              onClick={() => openNewModalForTab(activeTab)}
              className={`px-3.5 py-1.5 text-xs font-bold text-white rounded-md shadow-sm cursor-pointer whitespace-nowrap ${
                activeTab === "EVENT"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-[#E42528] hover:bg-[#B81D20]"
              }`}
            >
              {activeTab === "EVENT" ? "+ New Event" : "+ New Project"}
            </button>
          )}
        </div>
      </div>

      {/* Clean 5-Column Directory Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-3 px-4">
                  {activeTab === "EVENT" ? "Event" : "Project"}
                </th>
                <th className="py-3 px-4">Company</th>
                <th className="py-3 px-4">Billing Model &amp; Terms</th>
                <th className="py-3 px-4">Project Head</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-gray-400">
                    No {activeTab === "EVENT" ? "events" : "projects"} found matching your filter.
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

                  const summaryLine =
                    prof === "FIXED_FEE" || prof === "FIXED_QUOTE"
                      ? p.fixedMonthlyBill && p.fixedMonthlyBill > 0
                        ? `Tk ${formatTaka(p.fixedMonthlyBill)} Ex-VAT`
                        : p.budget && p.budget > 0
                        ? `Budget: Tk ${formatTaka(p.budget)}`
                        : "Fixed billing"
                      : `${Number(fPct)}% fee · ${p.billCycleDays ?? 30}d cycle`;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{p.name}</span>
                          {!p.active && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[10px] font-semibold">
                              Archived
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-gray-400">{p.code}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-700">{p.companyName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                        <span className="ml-2 text-[11px] text-gray-600 font-medium">
                          {summaryLine}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-gray-900 block">
                          {p.headName || "—"}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          Dir: {p.directorName || "Auto"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {canEditProjectItem(p) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-md cursor-pointer"
                            >
                              Setup
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProject(p)}
                                className="px-2 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-md border border-red-200 cursor-pointer"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-md cursor-pointer"
                          >
                            View Setup
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabbed Edit / View Project Setup Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900">
                    {editingProject.name}
                  </h3>
                  <span className="text-xs font-mono text-gray-500">({editingProject.code})</span>
                  {!canEditProjectItem(editingProject) && (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-300 text-[10px] font-bold">
                      Read-Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Project setup, billing terms, and cost heads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="text-gray-400 hover:text-black font-bold text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Clean 3-Tab Navigation inside Modal */}
            <div className="mt-4 flex border-b border-gray-200 gap-2">
              <button
                type="button"
                onClick={() => setModalTab("BASICS")}
                className={`px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
                  modalTab === "BASICS"
                    ? "border-[#E42528] text-[#E42528]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                1. Basics &amp; Approvers
              </button>
              <button
                type="button"
                onClick={() => setModalTab("BILLING")}
                className={`px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
                  modalTab === "BILLING"
                    ? "border-[#E42528] text-[#E42528]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                2. Billing Terms
              </button>
              <button
                type="button"
                onClick={() => setModalTab("COST_HEADS")}
                className={`px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
                  modalTab === "COST_HEADS"
                    ? "border-[#E42528] text-[#E42528]"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                3. Cost Heads ({editCostHeads.length})
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

            <form onSubmit={handleUpdateProject} className="mt-4 space-y-4">
              {/* TAB 1: BASICS & APPROVERS */}
              {modalTab === "BASICS" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700">Project Name</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white"
                      />
                    </div>
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">Type</label>
                      <select
                        value={editKind}
                        onChange={(e) => setEditKind(e.target.value as "PERMANENT" | "EVENT")}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                      >
                        <option value="PERMANENT">📁 Regular Project</option>
                        <option value="EVENT">🎪 Event / Activation</option>
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
                        <option value="INACTIVE">Archived</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <h4 className="text-xs font-bold text-gray-800">Approval Route</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">Project / Group Head</label>
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
                        <label className="block text-xs font-semibold text-gray-700">Dept Head / Checker</label>
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
                    </div>

                    {/* Optional Advanced Workflow Toggle */}
                    <div className="pt-2 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedWorkflow(!showAdvancedWorkflow)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{showAdvancedWorkflow ? "▾" : "▸"}</span>
                        <span>Advanced workflow rules (MD batch mode, step min amounts, allowed tags)</span>
                      </button>

                      {showAdvancedWorkflow && (
                        <div className="mt-3 space-y-3 pt-2 border-t border-gray-100">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700">Category</label>
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value)}
                                className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
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
                                className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                              >
                                <option value="INSTANT">Instant (Direct)</option>
                                <option value="MONTHLY">Monthly Batch</option>
                                <option value="WEEKLY">Weekly Batch</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700">Allowed Voucher Tags</label>
                              <input
                                type="text"
                                value={editTypesStr}
                                onChange={(e) => setEditTypesStr(e.target.value)}
                                className="mt-1 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="block text-[11px] font-semibold text-gray-600 mb-1.5">
                              Minimum Amount to Trigger Each Step (BDT, 0 = always required)
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              <div>
                                <label className="block text-[10px] text-gray-500">1. Head Min</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editHeadMinAmt}
                                  onChange={(e) => setEditHeadMinAmt(e.target.value)}
                                  className="mt-0.5 block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500">2. Checker Min</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editCheckerMinAmt}
                                  onChange={(e) => setEditCheckerMinAmt(e.target.value)}
                                  className="mt-0.5 block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500">3. Accounts Min</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editAccountsMinAmt}
                                  onChange={(e) => setEditAccountsMinAmt(e.target.value)}
                                  className="mt-0.5 block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500">4. Director Min</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editDirectorMinAmt}
                                  onChange={(e) => setEditDirectorMinAmt(e.target.value)}
                                  className="mt-0.5 block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500">5. MD Min</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editMdMinAmt}
                                  onChange={(e) => setEditMdMinAmt(e.target.value)}
                                  className="mt-0.5 block w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BILLING TERMS */}
              {modalTab === "BILLING" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-800 mb-2">
                      Billing Model
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditBillingProfile("COST_PLUS");
                          if (!editFeeRatePct) setEditFeeRatePct("8");
                        }}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          editBillingProfile === "COST_PLUS"
                            ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-bold text-xs text-gray-900">Cost + fee</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">e.g. UBL CM, 8%</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditBillingProfile("COST_PLUS_GROSSUP");
                          if (!editFeeRatePct) setEditFeeRatePct("4.5");
                          if (!editAitRatePct) setEditAitRatePct("1");
                          if (!editAitGrossupRatePct) setEditAitGrossupRatePct("2");
                        }}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          editBillingProfile === "COST_PLUS_GROSSUP"
                            ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-bold text-xs text-gray-900">Cost + fee + AIT gross-up</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">e.g. Robi SME, 4.5%</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditBillingProfile("COMMISSION");
                          if (!editFeeRatePct) setEditFeeRatePct("1.2");
                        }}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          editBillingProfile === "COMMISSION"
                            ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-bold text-xs text-gray-900">Commission</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">e.g. Banglalink, 1.2%</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditBillingProfile(editKind === "EVENT" ? "FIXED_QUOTE" : "FIXED_FEE");
                        }}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          editBillingProfile === "FIXED_FEE" || editBillingProfile === "FIXED_QUOTE"
                            ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-bold text-xs text-gray-900">
                          {editKind === "EVENT" ? "Fixed quote" : "Fixed monthly fee"}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">e.g. DBH office</div>
                      </button>
                    </div>
                  </div>

                  {/* Contextual Rate Inputs based on chosen Billing Model */}
                  {editBillingProfile === "FIXED_FEE" || editBillingProfile === "FIXED_QUOTE" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-gray-700">
                          {editKind === "EVENT"
                            ? "Fixed Event Client PO Ex-VAT (BDT)"
                            : "Fixed Monthly Bill Ex-VAT (BDT)"}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editFixedMonthlyBill}
                          onChange={(e) => setEditFixedMonthlyBill(e.target.value)}
                          placeholder="e.g. 270000"
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">VAT (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editVatRatePct}
                          onChange={(e) => setEditAitVatRatePct(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">AIT (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editAitRatePct}
                          onChange={(e) => setEditAitRatePct(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        editBillingProfile === "COST_PLUS_GROSSUP"
                          ? "sm:grid-cols-5"
                          : "sm:grid-cols-4"
                      }`}
                    >
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">
                          {editBillingProfile === "COMMISSION" ? "Commission (%)" : "Management Fee (%)"}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editFeeRatePct}
                          onChange={(e) => setEditFeeRatePct(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                        />
                      </div>
                      {editBillingProfile === "COST_PLUS_GROSSUP" && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700">
                            Bill Gross-Up (%)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={editAitGrossupRatePct}
                            onChange={(e) => setEditAitGrossupRatePct(e.target.value)}
                            className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                            title="Rate used to gross up the invoice bill (e.g. 2% for Robi SME)"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">
                          {editBillingProfile === "COST_PLUS_GROSSUP" ? "AIT Deducted (%)" : "AIT (%)"}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editAitRatePct}
                          onChange={(e) => setEditAitRatePct(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">VAT (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editVatRatePct}
                          onChange={(e) => setEditAitVatRatePct(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">Payment Due (Days)</label>
                        <input
                          type="number"
                          min="0"
                          value={editBillCycleDays}
                          onChange={(e) => setEditBillCycleDays(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">Funding</label>
                      <select
                        value={editFunding}
                        onChange={(e) => setEditFunding(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                      >
                        <option value="POSTPAID">Postpaid (IMS funds first)</option>
                        <option value="PREPAID">Prepaid (Client advances)</option>
                      </select>
                    </div>
                    {editKind !== "EVENT" && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">Salary Month</label>
                        <select
                          value={editSalaryMonthLag}
                          onChange={(e) => setEditSalaryMonthLag(e.target.value)}
                          className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                        >
                          <option value="1">Previous month (1m lag)</option>
                          <option value="0">Same month (0 lag)</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        {editKind === "EVENT" ? "Event Target Budget (BDT)" : "Monthly Target Budget (BDT)"}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Optional"
                        value={editBudget}
                        onChange={(e) => setEditBudget(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                      />
                    </div>
                  </div>

                  {/* Collapsible Advanced Billing Options */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedBilling(!showAdvancedBilling)}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showAdvancedBilling ? "▾" : "▸"}</span>
                      <span>More billing options (Maintenance budget, Amortization, Variance alert %)</span>
                    </button>

                    {showAdvancedBilling && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        {editKind !== "EVENT" && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700">
                                Maintenance Budget (BDT)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={editMaintenanceBudget}
                                onChange={(e) => setEditMaintenanceBudget(e.target.value)}
                                className="mt-1 block w-full px-2.5 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700">
                                Monthly Amortization (BDT)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={editMonthlyAmortization}
                                onChange={(e) => setEditMonthlyAmortization(e.target.value)}
                                className="mt-1 block w-full px-2.5 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-xs font-semibold text-gray-700">
                            Variance Reason Alert (%)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={editVarianceThresholdPct}
                            onChange={(e) => setEditVarianceThresholdPct(e.target.value)}
                            className="mt-1 block w-full px-2.5 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean Live Formula Preview */}
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-800">
                        Formula Check
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <label className="flex items-center gap-1 text-gray-600">
                          Billable:
                          <input
                            type="number"
                            placeholder={String(editPreview.billableCost)}
                            value={simBillableInput}
                            onChange={(e) => setSimBillableInput(e.target.value)}
                            className="w-24 px-2 py-0.5 border border-gray-300 rounded font-mono bg-white"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-gray-600">
                          IMS Inv:
                          <input
                            type="number"
                            placeholder={String(editPreview.imsInvestment)}
                            value={simImsInput}
                            onChange={(e) => setSimImsInput(e.target.value)}
                            className="w-20 px-2 py-0.5 border border-gray-300 rounded font-mono bg-white"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-gray-200">
                      <div>
                        <span className="text-gray-500 block text-[10px]">Bill without VAT</span>
                        <span className="font-mono font-bold text-gray-900">
                          Tk {formatTaka(editPreview.billExVat)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">Bill with VAT ({editPreview.vatRatePct}%)</span>
                        <span className="font-mono font-bold text-gray-900">
                          Tk {formatTaka(editPreview.billWithVat)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">AIT ({editPreview.aitRatePct}%)</span>
                        <span className="font-mono font-semibold text-amber-700">
                          -Tk {formatTaka(editPreview.aitDeducted)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">Net Profit</span>
                        <span
                          className={`font-mono font-extrabold ${
                            editPreview.netProfit >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          Tk {formatTaka(editPreview.netProfit)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: COST HEADS */}
              {modalTab === "COST_HEADS" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      Click any badge to switch between <strong>BILLABLE</strong> (client billed) and <strong>IMS_INVESTMENT</strong> (IMS cost).
                    </p>
                    {canEditProjectItem(editingProject) && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditCostHeads(
                            editKind === "EVENT" ? DEFAULT_EVENT_COST_HEADS : DEFAULT_PROJECT_COST_HEADS
                          )
                        }
                        className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 cursor-pointer"
                      >
                        ↺ Reset Defaults
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {editCostHeads.map((ch, idx) => (
                      <div
                        key={ch.id || idx}
                        className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded border border-gray-200 text-xs"
                      >
                        <div className="truncate mr-2">
                          <span className="font-medium text-gray-900">{ch.name}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={!canEditProjectItem(editingProject)}
                            onClick={() => {
                              if (!canEditProjectItem(editingProject)) return;
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
                          >
                            {ch.tag === "BILLABLE" ? "Billable" : "IMS Inv."}
                          </button>
                          {canEditProjectItem(editingProject) && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditCostHeads(editCostHeads.filter((_, i) => i !== idx))
                              }
                              className="text-gray-400 hover:text-red-600 font-bold px-1 cursor-pointer"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canEditProjectItem(editingProject) && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                      <input
                        type="text"
                        placeholder="New cost head name..."
                        value={editNewHeadName}
                        onChange={(e) => setEditNewHeadName(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white flex-1 min-w-[160px]"
                      />
                      <select
                        value={editNewHeadTag}
                        onChange={(e) =>
                          setEditNewHeadTag(e.target.value as "BILLABLE" | "IMS_INVESTMENT")
                        }
                        className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                      >
                        <option value="BILLABLE">Billable</option>
                        <option value="IMS_INVESTMENT">IMS Investment</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editNewHeadName.trim()) return;
                          const aliases = editNewHeadAliases
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setEditCostHeads([
                            ...editCostHeads,
                            {
                              id: `custom_${Date.now()}`,
                              name: editNewHeadName.trim(),
                              tag: editNewHeadTag,
                              ...(aliases.length > 0 ? { aliases } : {}),
                            },
                          ]);
                          setEditNewHeadName("");
                          setEditNewHeadAliases("");
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-md cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded-md cursor-pointer"
                >
                  {canEditProjectItem(editingProject) ? "Cancel" : "Close"}
                </button>
                {canEditProjectItem(editingProject) && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "Saving..." : "Save project setup"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clean New Project / Event Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {kind === "EVENT" ? "🎪 New Event" : "📁 New Project"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set up project basics, approvers, and billing model.
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    {kind === "EVENT" ? "Event Name" : "Project Name"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      kind === "EVENT" ? "e.g. Robi Campus Activation" : "e.g. Robi SME"
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Code</label>
                  <input
                    type="text"
                    required
                    placeholder={kind === "EVENT" ? "EVT-ROBI" : "PROJ-ROBI"}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              {/* Billing Model Selector Cards */}
              <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <label className="block text-xs font-bold text-gray-800">Billing Model</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingProfile("COST_PLUS")}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      billingProfile === "COST_PLUS"
                        ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-gray-900">Cost + fee</div>
                    <div className="text-[10px] text-gray-500">e.g. 8% fee</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingProfile("COST_PLUS_GROSSUP")}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      billingProfile === "COST_PLUS_GROSSUP"
                        ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-gray-900">Cost + AIT gross-up</div>
                    <div className="text-[10px] text-gray-500">e.g. Robi SME</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingProfile("COMMISSION")}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      billingProfile === "COMMISSION"
                        ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-gray-900">Commission</div>
                    <div className="text-[10px] text-gray-500">e.g. 1.2% comm</div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBillingProfile(kind === "EVENT" ? "FIXED_QUOTE" : "FIXED_FEE")
                    }
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      billingProfile === "FIXED_FEE" || billingProfile === "FIXED_QUOTE"
                        ? "bg-red-50 border-[#E42528] ring-1 ring-[#E42528]"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-gray-900">
                      {kind === "EVENT" ? "Fixed quote" : "Fixed monthly"}
                    </div>
                    <div className="text-[10px] text-gray-500">Fixed bill</div>
                  </button>
                </div>

                <div
                  className={`grid grid-cols-1 gap-3 pt-1 ${
                    billingProfile === "COST_PLUS_GROSSUP" ? "sm:grid-cols-4" : "sm:grid-cols-3"
                  }`}
                >
                  {billingProfile === "FIXED_FEE" || billingProfile === "FIXED_QUOTE" ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        Fixed Bill Ex-VAT (BDT)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={fixedMonthlyBill}
                        onChange={(e) => setFixedMonthlyBill(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        Fee / Commission (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={feeRatePct}
                        onChange={(e) => setFeeRatePct(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                      />
                    </div>
                  )}
                  {billingProfile === "COST_PLUS_GROSSUP" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        Bill Gross-Up (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={aitGrossupRatePct}
                        onChange={(e) => setAitGrossupRatePct(e.target.value)}
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">
                      {billingProfile === "COST_PLUS_GROSSUP" ? "AIT Deducted (%)" : "AIT (%)"}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={aitRatePct}
                      onChange={(e) => setAitRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">VAT (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={vatRatePct}
                      onChange={(e) => setVatRatePct(e.target.value)}
                      className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Saving..." : kind === "EVENT" ? "Create Event" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
