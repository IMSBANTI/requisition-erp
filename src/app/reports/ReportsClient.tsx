"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

interface Props {
  currentUser: any;
  companies: { id: string; name: string; code: string }[];
  projects: { id: string; name: string; category: string; budget: any; companyId: string }[];
  departments: { id: string; name: string }[];
  categories: { key: string; label: string }[];
}

export default function ReportsClient({
  currentUser,
  companies,
  projects,
  departments,
  categories,
}: Props) {
  const [activeTab, setActiveTab] = useState<"query" | "monthly" | "projects" | "company" | "ageing">("query");

  // Filters state
  const [companyId, setCompanyId] = useState("ALL");
  const [projectId, setProjectId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [paymentMode, setPaymentMode] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");

  // Data & loading state
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    metrics: {
      count: number;
      totalRequested: number;
      totalApproved: number;
      totalExecuted: number;
      totalPending: number;
      totalRejected: number;
      companyBreakdown: { name: string; count: number; total: number }[];
      projectBreakdown: { name: string; count: number; total: number; budget: number }[];
      categoryBreakdown: { name: string; count: number; total: number }[];
      statusBreakdown: { name: string; count: number; total: number }[];
      monthBreakdown: { month: string; count: number; requested: number; approved: number; executed: number }[];
    };
    requisitions: any[];
  } | null>(null);

  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Quick Date Range Presets
  function applyDatePreset(preset: "all" | "this_month" | "last_month" | "fiscal_year" | "calendar_year") {
    const now = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "this_month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(first.toISOString().split("T")[0]);
      setEndDate(last.toISOString().split("T")[0]);
    } else if (preset === "last_month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(first.toISOString().split("T")[0]);
      setEndDate(last.toISOString().split("T")[0]);
    } else if (preset === "fiscal_year") {
      // BD Fiscal Year runs from July 1 to June 30
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed (6 is July)
      const fyStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
      const fyEndYear = fyStartYear + 1;
      setStartDate(`${fyStartYear}-07-01`);
      setEndDate(`${fyEndYear}-06-30`);
    } else if (preset === "calendar_year") {
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(`${now.getFullYear()}-12-31`);
    }
  }

  // Fetch report data
  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyId !== "ALL") params.append("companyId", companyId);
      if (projectId !== "ALL") params.append("projectId", projectId);
      if (departmentId !== "ALL") params.append("departmentId", departmentId);
      if (category !== "ALL") params.append("category", category);
      if (status !== "ALL") params.append("status", status);
      if (paymentMode !== "ALL") params.append("paymentMode", paymentMode);
      if (type !== "ALL") params.append("type", type);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (search) params.append("search", search);

      const res = await fetch(`/api/reports/query?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load report data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [companyId, projectId, departmentId, category, status, paymentMode, type, startDate, endDate]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchData();
  }

  function handleDownloadCsv() {
    const params = new URLSearchParams();
    if (companyId !== "ALL") params.append("companyId", companyId);
    if (projectId !== "ALL") params.append("projectId", projectId);
    if (departmentId !== "ALL") params.append("departmentId", departmentId);
    if (category !== "ALL") params.append("category", category);
    if (status !== "ALL") params.append("status", status);
    if (paymentMode !== "ALL") params.append("paymentMode", paymentMode);
    if (type !== "ALL") params.append("type", type);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (search) params.append("search", search);
    params.append("export", "csv");

    window.location.href = `/api/reports/query?${params.toString()}`;
  }

  const metrics = data?.metrics || {
    count: 0,
    totalRequested: 0,
    totalApproved: 0,
    totalExecuted: 0,
    totalPending: 0,
    totalRejected: 0,
    companyBreakdown: [],
    projectBreakdown: [],
    categoryBreakdown: [],
    statusBreakdown: [],
    monthBreakdown: [],
  };

  const filteredProjects =
    companyId === "ALL" ? projects : projects.filter((p) => p.companyId === companyId);

  // Ageing requisitions currently pending
  const ageingRequisitions = (data?.requisitions || []).filter((r) =>
    [
      "SUBMITTED",
      "PENDING_HEAD",
      "PENDING_CHECKER",
      "PENDING_ACCOUNTS",
      "PENDING_DIRECTOR",
      "PENDING_MD",
    ].includes(r.status)
  ).map((r) => {
    const submitted = new Date(r.submittedAt || r.createdAt);
    const now = new Date();
    const daysPending = Math.max(0, Math.floor((now.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24)));
    return { ...r, daysPending };
  }).sort((a, b) => b.daysPending - a.daysPending);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">📈</span>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Query Manager & Custom Financial Reports
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enterprise analytics for IMS GROUP, CLAN, SCL & TradePULSE &bull; Filter, inspect, and export accounting-grade reports.
          </p>
        </div>

        {/* Global Export & Print Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded shadow cursor-pointer transition-colors"
          >
            <span>📥</span>
            <span>Download CSV / Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded shadow cursor-pointer transition-colors"
          >
            <span>🖨️</span>
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Requisitions</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{metrics.count}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Matching current filters</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Requested</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">Tk {formatTaka(metrics.totalRequested)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Gross sum</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Approved / Forwarded</p>
          <p className="text-xl font-extrabold text-blue-700 mt-1">Tk {formatTaka(metrics.totalApproved)}</p>
          <p className="text-[10px] text-blue-500 mt-0.5">Committed funds</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Executed / Paid</p>
          <p className="text-xl font-extrabold text-emerald-700 mt-1">Tk {formatTaka(metrics.totalExecuted)}</p>
          <p className="text-[10px] text-emerald-500 mt-0.5">Disbursed by Accounts</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Pending Approvals</p>
          <p className="text-xl font-extrabold text-amber-600 mt-1">Tk {formatTaka(metrics.totalPending)}</p>
          <p className="text-[10px] text-amber-500 mt-0.5">In approval pipeline</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200 rounded-t-lg px-4 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("query")}
          className={`py-3 px-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === "query"
              ? "border-[#E42528] text-[#E42528]"
              : "border-transparent text-gray-600 hover:text-black"
          }`}
        >
          🔍 Query Manager & Data Explorer
        </button>
        <button
          onClick={() => setActiveTab("monthly")}
          className={`py-3 px-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === "monthly"
              ? "border-[#E42528] text-[#E42528]"
              : "border-transparent text-gray-600 hover:text-black"
          }`}
        >
          📅 Monthly & Yearly Summary
        </button>
        <button
          onClick={() => setActiveTab("projects")}
          className={`py-3 px-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === "projects"
              ? "border-[#E42528] text-[#E42528]"
              : "border-transparent text-gray-600 hover:text-black"
          }`}
        >
          📁 Project-wise P&L / 24 Outsourcing Projects
        </button>
        <button
          onClick={() => setActiveTab("company")}
          className={`py-3 px-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === "company"
              ? "border-[#E42528] text-[#E42528]"
              : "border-transparent text-gray-600 hover:text-black"
          }`}
        >
          🏢 Group & Company Consolidated
        </button>
        <button
          onClick={() => setActiveTab("ageing")}
          className={`py-3 px-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === "ageing"
              ? "border-[#E42528] text-[#E42528]"
              : "border-transparent text-gray-600 hover:text-black"
          }`}
        >
          ⏳ Approver Ageing & Bottlenecks ({ageingRequisitions.length})
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="space-y-6">
        {/* Filter Controls (Shared across views) */}
        <div className="bg-white p-4 rounded-b-lg border border-t-0 border-gray-200 shadow-sm space-y-3.5">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
            <span className="text-xs font-bold text-gray-700">Quick Date Presets:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyDatePreset("all")}
                className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("this_month")}
                className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("last_month")}
                className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("fiscal_year")}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 rounded text-[#E42528]"
              >
                Fiscal Year (July–June)
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset("calendar_year")}
                className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                Calendar Year
              </button>
            </div>
          </div>

          {/* Detailed Filters Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Company</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-semibold bg-white"
              >
                <option value="ALL">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-semibold bg-white"
              >
                <option value="ALL">All Projects</option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-semibold bg-white"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-semibold bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PENDING_HEAD">Pending Head</option>
                <option value="PENDING_CHECKER">Pending Checker</option>
                <option value="PENDING_ACCOUNTS">Pending Accounts</option>
                <option value="PENDING_DIRECTOR">Pending Director</option>
                <option value="PENDING_MD">Pending MD</option>
                <option value="APPROVED">Approved</option>
                <option value="FORWARDED">Forwarded</option>
                <option value="EXECUTED">Executed / Paid</option>
                <option value="RETURNED">Returned</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              />
            </div>
          </div>

          {/* Search bar & Reset */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              placeholder="Search keyword (Particulars, Purpose, Req #, Maker Name, Comments)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-xs border border-gray-300 rounded px-3 py-1.5 bg-white"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded cursor-pointer"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setCompanyId("ALL");
                setProjectId("ALL");
                setDepartmentId("ALL");
                setCategory("ALL");
                setStatus("ALL");
                setPaymentMode("ALL");
                setType("ALL");
                setStartDate("");
                setEndDate("");
                setSearch("");
              }}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded cursor-pointer"
            >
              Reset All
            </button>
          </form>
        </div>

        {/* TAB 1: Query Manager & Data Explorer */}
        {activeTab === "query" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  Detailed Requisition Query Results ({data?.requisitions.length || 0})
                </h2>
                <p className="text-[11px] text-gray-500">
                  Click any row to inspect individual line items (Particulars, Purpose, Qty, Unit Price).
                </p>
              </div>
              <span className="text-xs font-semibold text-gray-500">
                Sum: <strong className="text-black">Tk {formatTaka(metrics.totalRequested)}</strong>
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-xs text-gray-500 font-semibold">
                Loading query results...
              </div>
            ) : data?.requisitions.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500 font-semibold">
                No requisitions match the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Req #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Company</th>
                      <th className="py-2.5 px-3">Project</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Maker</th>
                      <th className="py-2.5 px-3 text-right">Amount (Tk)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data?.requisitions.map((req) => {
                      const isExpanded = expandedReqId === req.id;
                      return (
                        <div key={req.id} className="contents">
                          <tr
                            onClick={() => setExpandedReqId(isExpanded ? null : req.id)}
                            className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                          >
                            <td className="py-2 px-3 font-mono font-bold text-gray-900">
                              {req.number || "DRAFT"}
                            </td>
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                              {new Date(req.date).toLocaleDateString("en-GB")}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800">
                                {req.company.code}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-gray-800 max-w-[180px] truncate">
                              {req.project.name}
                            </td>
                            <td className="py-2 px-3 text-gray-500 text-[11px]">
                              {req.category}
                            </td>
                            <td className="py-2 px-3">
                              <p className="font-semibold text-gray-900 truncate">{req.makerName}</p>
                              <p className="text-[10px] text-gray-400">{req.makerDesignation}</p>
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-gray-900 whitespace-nowrap">
                              {formatTaka(req.total)}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  STATUS_COLORS[req.status] || "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {STATUS_LABELS[req.status] || req.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/requisitions/${req.id}`}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded text-[11px]"
                              >
                                View
                              </Link>
                              <Link
                                href={`/requisitions/${req.id}/print`}
                                target="_blank"
                                className="px-2 py-1 bg-black hover:bg-gray-800 text-white font-semibold rounded text-[11px]"
                              >
                                🖨️ PDF
                              </Link>
                            </td>
                          </tr>

                          {/* Expanded Line Items Detail */}
                          {isExpanded && (
                            <tr className="bg-gray-50/50">
                              <td colSpan={9} className="p-3 pl-8">
                                <div className="bg-white border border-gray-200 rounded p-3 text-xs space-y-2">
                                  <div className="flex items-center justify-between font-bold text-gray-700 border-b border-gray-100 pb-1.5">
                                    <span>Particulars Breakdown ({req.items.length} items)</span>
                                    <span>
                                      Payment Mode: <strong>{req.paymentMode || "Standard"}</strong> &bull; Vendor: <strong>{req.vendor || "None"}</strong>
                                    </span>
                                  </div>
                                  <table className="w-full text-left text-[11px]">
                                    <thead>
                                      <tr className="text-gray-400 font-semibold border-b border-gray-100">
                                        <th className="py-1">SL</th>
                                        <th className="py-1">Particulars</th>
                                        <th className="py-1">Purpose</th>
                                        <th className="py-1 text-right">Qty</th>
                                        <th className="py-1 text-right">Unit Price</th>
                                        <th className="py-1 text-right">Amount (Tk)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {req.items.map((it: any) => (
                                        <tr key={it.id}>
                                          <td className="py-1 text-gray-400 font-mono">{it.sl}</td>
                                          <td className="py-1 font-medium text-gray-800">{it.particulars}</td>
                                          <td className="py-1 text-gray-500">{it.purpose || "—"}</td>
                                          <td className="py-1 text-right font-medium">{it.qty}</td>
                                          <td className="py-1 text-right">{formatTaka(it.unitPrice)}</td>
                                          <td className="py-1 text-right font-bold text-gray-900">{formatTaka(it.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {req.comments && (
                                    <p className="text-[11px] text-gray-600 pt-1 border-t border-gray-100">
                                      <strong>Comments:</strong> {req.comments}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </div>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Monthly & Yearly Summary */}
        {activeTab === "monthly" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Month-by-Month Financial Trend</h2>
              <p className="text-[11px] text-gray-500">
                Monthly breakdown showing total requested, approved, and executed disbursement amounts.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3">Month</th>
                    <th className="py-2 px-3 text-center">Req Count</th>
                    <th className="py-2 px-3 text-right">Requested (Tk)</th>
                    <th className="py-2 px-3 text-right text-blue-700">Approved (Tk)</th>
                    <th className="py-2 px-3 text-right text-emerald-700">Executed / Paid (Tk)</th>
                    <th className="py-2 px-3 text-right">Disbursement Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metrics.monthBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        No monthly data available for the current filter.
                      </td>
                    </tr>
                  ) : (
                    metrics.monthBreakdown.map((m) => {
                      const ratio = m.requested > 0 ? ((m.executed / m.requested) * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={m.month} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-bold text-gray-900">{m.month}</td>
                          <td className="py-2 px-3 text-center font-semibold text-gray-700">{m.count}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-gray-900">
                            {formatTaka(m.requested)}
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold text-blue-700">
                            {formatTaka(m.approved)}
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold text-emerald-700">
                            {formatTaka(m.executed)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-gray-700">
                            {ratio}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Project-wise P&L / 24 Outsourcing Projects */}
        {activeTab === "projects" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  Project-wise Expense & Budget Utilization (All Projects & 24 Outsourcing)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Monitors expenses against allocated project budgets and tracks all 24 outsourcing contracts.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3">Project Name</th>
                    <th className="py-2 px-3 text-center">Requisitions</th>
                    <th className="py-2 px-3 text-right">Budget (Tk)</th>
                    <th className="py-2 px-3 text-right">Actual Spent (Tk)</th>
                    <th className="py-2 px-3 text-right">Variance / Remaining</th>
                    <th className="py-2 px-3 text-center w-36">Budget Utilization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metrics.projectBreakdown.map((proj) => {
                    const budget = proj.budget || 0;
                    const spent = proj.total;
                    const remaining = budget - spent;
                    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                    const isOver = budget > 0 && spent > budget;

                    return (
                      <tr key={proj.name} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-900">{proj.name}</td>
                        <td className="py-2 px-3 text-center font-semibold text-gray-700">{proj.count}</td>
                        <td className="py-2 px-3 text-right font-medium text-gray-700">
                          {budget > 0 ? formatTaka(budget) : "Uncapped"}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-gray-900">
                          {formatTaka(spent)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            isOver ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {budget > 0 ? formatTaka(remaining) : "—"}
                        </td>
                        <td className="py-2 px-3">
                          {budget > 0 ? (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    isOver ? "bg-red-600" : pct > 80 ? "bg-amber-500" : "bg-emerald-600"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] font-mono font-bold text-gray-600 w-8">
                                {pct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-center block text-gray-400 text-[10px]">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Group & Company Consolidated */}
        {activeTab === "company" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Company-wise Consolidated Expenditure</h2>
              <p className="text-[11px] text-gray-500">
                Summary across group entities: Integrated Marketing Service, CLAN, Sales Connect & TradePULSE.
              </p>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3">Company</th>
                    <th className="py-2 px-3 text-center">Reqs</th>
                    <th className="py-2 px-3 text-right">Total (Tk)</th>
                    <th className="py-2 px-3 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metrics.companyBreakdown.map((c) => {
                    const share =
                      metrics.totalRequested > 0
                        ? ((c.total / metrics.totalRequested) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <tr key={c.name} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-900">{c.name}</td>
                        <td className="py-2 px-3 text-center font-semibold text-gray-700">{c.count}</td>
                        <td className="py-2 px-3 text-right font-extrabold text-gray-900">{formatTaka(c.total)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-gray-600">{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Category / Expense Head Breakdown</h2>
              <p className="text-[11px] text-gray-500">
                Expenditure distributed by operational category and directorate.
              </p>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3 text-center">Reqs</th>
                    <th className="py-2 px-3 text-right">Total (Tk)</th>
                    <th className="py-2 px-3 text-right">% Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {metrics.categoryBreakdown.map((cat) => {
                    const share =
                      metrics.totalRequested > 0
                        ? ((cat.total / metrics.totalRequested) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <tr key={cat.name} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-900">{cat.name}</td>
                        <td className="py-2 px-3 text-center font-semibold text-gray-700">{cat.count}</td>
                        <td className="py-2 px-3 text-right font-extrabold text-gray-900">{formatTaka(cat.total)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-gray-600">{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: Approver Ageing & Bottlenecks */}
        {activeTab === "ageing" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Pending Approvals Ageing & Bottleneck Report ({ageingRequisitions.length})
              </h2>
              <p className="text-[11px] text-gray-500">
                Identifies requisitions held up in approval steps, who is holding them, and how many days have elapsed.
              </p>
            </div>

            {ageingRequisitions.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 font-semibold">
                🎉 No pending requisitions currently held up in approval!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                      <th className="py-2 px-3">Req #</th>
                      <th className="py-2 px-3">Company & Project</th>
                      <th className="py-2 px-3">Maker</th>
                      <th className="py-2 px-3 text-right">Amount (Tk)</th>
                      <th className="py-2 px-3">Holding Stage</th>
                      <th className="py-2 px-3">Current Assignee</th>
                      <th className="py-2 px-3 text-center">Days Elapsed</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ageingRequisitions.map((req) => {
                      const isAlert = req.daysPending >= 3;
                      return (
                        <tr key={req.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-mono font-bold text-gray-900">
                            {req.number || "DRAFT"}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-gray-800">{req.company.code}</span> &bull; {req.project.name}
                          </td>
                          <td className="py-2 px-3">{req.makerName}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-gray-900">
                            {formatTaka(req.total)}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                STATUS_COLORS[req.status] || "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {STATUS_LABELS[req.status] || req.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-gray-800">
                            {req.currentAssignee?.name || (req.status === "PENDING_ACCOUNTS" ? "Accounts Pool" : "Pending")}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isAlert ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {req.daysPending} {req.daysPending === 1 ? "day" : "days"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Link
                              href={`/requisitions/${req.id}`}
                              className="px-2.5 py-1 bg-black hover:bg-gray-800 text-white font-semibold rounded text-[11px]"
                            >
                              Open &rarr;
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
