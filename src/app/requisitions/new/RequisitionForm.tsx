"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { amountInWords } from "@/lib/numberToWords";
import { lineAmount, grandTotal, formatTaka } from "@/lib/money";
import { CATEGORIES } from "@/lib/constants";

interface FormProps {
  user: {
    id: string;
    name: string;
    designation: string;
    signature: string | null;
    hasPin: boolean;
    companyId?: string | null;
    departmentId?: string | null;
    departmentName?: string;
    secondaryDepartments?: string[];
  };
  companies: any[];
  departments?: any[];
  projects: any[];
}

interface ItemRow {
  sl: number;
  particulars: string;
  purpose: string;
  qty: string;
  unitPrice: string;
}

const COMPANY_DIVISION_CODES = new Set([
  "IMS-HO",
  "IMS-IT",
  "IMS-STUDIO",
  "IMS-BD-BLUE",
  "IMS-BD-RED",
  "CLAN-MAIN",
  "SCL-MAIN",
]);

function inferCategoryFromDepartment(deptName: string): string {
  const d = (deptName || "").toLowerCase();
  if (d.includes("it")) return "AI_IT";
  if (d.includes("studio")) return "STUDIO";
  if (d.includes("business development")) return "BUSINESS_DEVELOPMENT";
  if (d.includes("outsourcing") || d.includes("project ")) return "OUTSOURCING";
  if (d.includes("operation") || d.includes("event")) return "OPERATIONS_EVENT";
  if (d.includes("ims")) return "IMS";
  return "GENERAL";
}

export default function RequisitionForm({ user, companies, departments = [], projects }: FormProps) {
  const router = useRouter();

  // Determine whether this user defaults to Project-Based (Outsourcing, TradePULSE, Operations & Events) or Company-Based (Permanent Employee)
  const defaultIsProjectUser = useMemo(() => {
    const deptText = [user.departmentName || "", ...(user.secondaryDepartments || [])]
      .join(" ")
      .toLowerCase();
    return (
      deptText.includes("outsourcing") ||
      deptText.includes("project ") ||
      deptText.includes("operation") ||
      deptText.includes("event") ||
      deptText.includes("tradepulse")
    );
  }, [user.departmentName, user.secondaryDepartments]);

  const [requisitionMode, setRequisitionMode] = useState<"COMPANY" | "PROJECT">(
    defaultIsProjectUser ? "PROJECT" : "COMPANY"
  );

  // Project stream filter for Project-Based mode: ALL | OUTSOURCING | TRADEPULSE | OPERATIONS_EVENT
  const [projectStream, setProjectStream] = useState<
    "ALL" | "OUTSOURCING" | "TRADEPULSE" | "OPERATIONS_EVENT"
  >("ALL");

  const [departmentId, setDepartmentId] = useState<string>(
    user.departmentId || departments[0]?.id || ""
  );

  // Separate client/long-running projects (IMS Outsourcing, TradePULSE, IMS Operations & Events)
  const projectBasedList = useMemo(() => {
    const list = projects.filter((p) => !COMPANY_DIVISION_CODES.has(p.code));
    return list.length > 0 ? list : projects;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (projectStream === "ALL") return projectBasedList;
    if (projectStream === "OUTSOURCING") {
      return projectBasedList.filter(
        (p) =>
          (p.category === "OUTSOURCING" || p.category === "IMS_OUTSOURCING_STUDIO") &&
          p.companyCode !== "TP"
      );
    }
    if (projectStream === "TRADEPULSE") {
      return projectBasedList.filter(
        (p) => p.companyCode === "TP" || p.name.toLowerCase().includes("tradepulse")
      );
    }
    if (projectStream === "OPERATIONS_EVENT") {
      return projectBasedList.filter(
        (p) => p.category === "OPERATIONS_EVENT" || p.kind === "EVENT"
      );
    }
    return projectBasedList;
  }, [projectBasedList, projectStream]);

  const [projectId, setProjectId] = useState(
    projectBasedList[0]?.id || projects[0]?.id || ""
  );
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projectId, projects]
  );

  const defaultCompanyId =
    user.companyId ||
    companies.find((c) => c.code === "IMS")?.id ||
    selectedProject?.companyId ||
    companies[0]?.id ||
    "";

  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId),
    [companyId, companies]
  );

  // Switch between IMS Group Company Requisition & Project/Event Requisition
  function handleModeChange(mode: "COMPANY" | "PROJECT") {
    setRequisitionMode(mode);
    if (mode === "COMPANY") {
      const compId =
        user.companyId || companies.find((c) => c.code === "IMS")?.id || companies[0]?.id || "";
      setCompanyId(compId);
      const deptObj = departments.find((d) => d.id === departmentId);
      const inferredCat = inferCategoryFromDepartment(deptObj?.name || user.departmentName || "");
      setCategory(inferredCat);
      setType(inferredCat === "AI_IT" ? "IT" : inferredCat === "STUDIO" ? "STUDIO" : "ADMIN");
    } else {
      const firstProj = filteredProjects[0] || projectBasedList[0] || projects[0];
      if (firstProj) {
        setProjectId(firstProj.id);
        setCompanyId(firstProj.companyId);
        setCategory(
          firstProj.category === "IMS_OUTSOURCING_STUDIO"
            ? "OUTSOURCING"
            : firstProj.category || "OUTSOURCING"
        );
        setType(firstProj.requisitionTypes?.[0] || "BPO");
      }
    }
  }

  function handleStreamChange(stream: "ALL" | "OUTSOURCING" | "TRADEPULSE" | "OPERATIONS_EVENT") {
    setProjectStream(stream);
    let list = projectBasedList;
    if (stream === "OUTSOURCING") {
      list = projectBasedList.filter(
        (p) =>
          (p.category === "OUTSOURCING" || p.category === "IMS_OUTSOURCING_STUDIO") &&
          p.companyCode !== "TP"
      );
    } else if (stream === "TRADEPULSE") {
      list = projectBasedList.filter(
        (p) => p.companyCode === "TP" || p.name.toLowerCase().includes("tradepulse")
      );
    } else if (stream === "OPERATIONS_EVENT") {
      list = projectBasedList.filter(
        (p) => p.category === "OPERATIONS_EVENT" || p.kind === "EVENT"
      );
    }
    if (list.length > 0) {
      const first = list[0];
      setProjectId(first.id);
      setCompanyId(first.companyId);
      setCategory(
        first.category === "IMS_OUTSOURCING_STUDIO"
          ? "OUTSOURCING"
          : first.category || "OUTSOURCING"
      );
      setType(first.requisitionTypes?.[0] || "BPO");
    }
  }

  // When project changes in PROJECT mode, update company and default category
  function handleProjectChange(id: string) {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p) {
      setCompanyId(p.companyId);
      setCategory(
        p.category === "IMS_OUTSOURCING_STUDIO" ? "OUTSOURCING" : p.category || "OUTSOURCING"
      );
      setType(p.requisitionTypes?.[0] || "BPO");
    }
  }

  function handleDepartmentChange(dId: string) {
    setDepartmentId(dId);
    const dObj = departments.find((d) => d.id === dId);
    if (dObj) {
      const cat = inferCategoryFromDepartment(dObj.name);
      setCategory(cat);
      if (cat === "AI_IT") setType("IT");
      else if (cat === "STUDIO") setType("STUDIO");
      else setType("ADMIN");
    }
  }

  const initialCat = defaultIsProjectUser
    ? selectedProject?.category === "IMS_OUTSOURCING_STUDIO"
      ? "OUTSOURCING"
      : selectedProject?.category || "OUTSOURCING"
    : inferCategoryFromDepartment(user.departmentName || "");

  const [type, setType] = useState(
    defaultIsProjectUser
      ? selectedProject?.requisitionTypes?.[0] || "BPO"
      : initialCat === "AI_IT"
      ? "IT"
      : initialCat === "STUDIO"
      ? "STUDIO"
      : "ADMIN"
  );
  const [customType, setCustomType] = useState("");
  const activeType = type === "OTHER" ? customType : type;

  const [category, setCategory] = useState(initialCat);
  const [priority, setPriority] = useState("NORMAL");
  const [disburseOn, setDisburseOn] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [comments, setComments] = useState("");

  const [items, setItems] = useState<ItemRow[]>([
    { sl: 1, particulars: "", purpose: "", qty: "1", unitPrice: "0" },
  ]);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [pinOrPassword, setPinOrPassword] = useState("");
  const [showSignModal, setShowSignModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"SUBMIT" | "DRAFT">("SUBMIT");
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachmentError("");
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    const MAX_KB = 200;
    const oversized = selected.filter((f) => f.size > MAX_KB * 1024);

    if (oversized.length > 0) {
      const names = oversized
        .map((f) => `"${f.name}" (${(f.size / 1024).toFixed(0)} KB)`)
        .join(", ");
      setAttachmentError(
        `File size limit exceeded: ${names}. Maximum allowed file size is 200 KB per file. Please compress or resize before attaching.`
      );
      e.target.value = "";
      return;
    }

    setAttachments((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Calculations
  const calculatedTotal = useMemo(() => {
    return grandTotal(
      items.map((it) => ({
        qty: parseFloat(it.qty) || 0,
        unitPrice: parseFloat(it.unitPrice) || 0,
      }))
    );
  }, [items]);

  const words = useMemo(() => {
    try {
      return amountInWords(calculatedTotal);
    } catch {
      return "";
    }
  }, [calculatedTotal]);

  function handleRowChange(index: number, field: keyof ItemRow, val: string) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };
    setItems(updated);
  }

  function addRow() {
    setItems((prev) => [
      ...prev,
      { sl: prev.length + 1, particulars: "", purpose: "", qty: "1", unitPrice: "0" },
    ]);
  }

  function removeRow(index: number) {
    if (items.length <= 1) return;
    const updated = items.filter((_, i) => i !== index).map((row, i) => ({ ...row, sl: i + 1 }));
    setItems(updated);
  }

  async function handleFinalSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      // Build FormData for multipart payload including files
      const formData = new FormData();
      formData.append("requisitionMode", requisitionMode);
      formData.append("projectId", projectId);
      formData.append("companyId", companyId);
      formData.append("departmentId", departmentId);
      formData.append("type", activeType.trim().toUpperCase() || "BPO");
      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("disburseOn", disburseOn);
      formData.append("paymentMode", paymentMode);
      formData.append("comments", comments);
      formData.append("action", submitAction);
      formData.append("pinOrPassword", pinOrPassword);
      formData.append(
        "items",
        JSON.stringify(
          items.map((it) => ({
            sl: it.sl,
            particulars: it.particulars,
            purpose: it.purpose,
            qty: parseFloat(it.qty) || 0,
            unitPrice: parseFloat(it.unitPrice) || 0,
          }))
        )
      );

      attachments.forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/requisitions", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit requisition");
      }

      router.push(`/requisitions/${data.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to submit");
      setIsSubmitting(false);
      setShowSignModal(false);
    }
  }

  return (
    <div className="mt-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-[#E42528] text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Requisition Type Selector: IMS Group Company (Permanent Employee) vs. Project-Based (Months/Years) */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-gray-900 block">
              1. Choose Requisition Type
            </span>
            <span className="text-[11px] text-gray-500">
              Select whether this requisition is for an IMS Group Company (permanent employee / department) or a long-running Project / Event.
            </span>
          </div>
          <div className="inline-flex rounded-lg p-1 bg-gray-100 border border-gray-200">
            <button
              type="button"
              onClick={() => handleModeChange("COMPANY")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                requisitionMode === "COMPANY"
                  ? "bg-[#E42528] text-white shadow-xs"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              🏢 IMS Group Company (Permanent Employee)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("PROJECT")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                requisitionMode === "PROJECT"
                  ? "bg-gray-900 text-white shadow-xs"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              📁 Project-Based (Outsourcing / TradePULSE / Events)
            </button>
          </div>
        </div>

        {requisitionMode === "PROJECT" && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="text-[11px] font-semibold text-gray-500 mr-1">Project Source:</span>
            <button
              type="button"
              onClick={() => handleStreamChange("ALL")}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                projectStream === "ALL"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              All Projects & Events ({projectBasedList.length})
            </button>
            <button
              type="button"
              onClick={() => handleStreamChange("OUTSOURCING")}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                projectStream === "OUTSOURCING"
                  ? "bg-red-50 text-[#E42528] border-red-300"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              IMS Outsourcing (Robi, GP, UPY, Singer, BAT, Unilever...)
            </button>
            <button
              type="button"
              onClick={() => handleStreamChange("TRADEPULSE")}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                projectStream === "TRADEPULSE"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              TradePULSE
            </button>
            <button
              type="button"
              onClick={() => handleStreamChange("OPERATIONS_EVENT")}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                projectStream === "OPERATIONS_EVENT"
                  ? "bg-blue-50 text-blue-800 border-blue-300"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              IMS Operations & Events (Banglalink, GP, Bkash, BAT...)
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {requisitionMode === "COMPANY" ? (
            <>
              <div className="flex flex-col justify-end">
                <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
                  IMS Group Company *
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.legalName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
                  Department / Division *
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col justify-end">
                <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
                  Select Project / Event *
                </label>
                <select
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {(filteredProjects.length > 0 ? filteredProjects : projects).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
                  Sister Concern Letterhead
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.legalName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex flex-col justify-end">
            <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
              Requisition Tag / Type
            </label>
            <div className="flex space-x-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
              >
                {(requisitionMode === "COMPANY"
                  ? ["ADMIN", "CASH", "BPO", "IT", "STUDIO"]
                  : selectedProject?.requisitionTypes || ["BPO", "EVENT", "ADMIN", "CASH"]
                ).map((t: string) => (
                  <option key={t} value={t}>
                    ({t})
                  </option>
                ))}
                <option value="OTHER">Other (Custom)</option>
              </select>
              {type === "OTHER" && (
                <input
                  type="text"
                  placeholder="TAG"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  className="h-9 w-24 px-2 py-1 border border-gray-300 rounded-md text-xs font-bold uppercase bg-white"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-xs font-semibold text-gray-700 truncate mb-1">
              Approval Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Actual Paper-Style Requisition Form Frame */}
      <div
        className="bg-white p-6 sm:p-8 rounded-xl border-2 border-gray-300 shadow-md"
        style={{
          backgroundColor: selectedCompany?.paperTint === "#FFF4C2" ? "#FFFAE0" : "#FFFFFF",
        }}
      >
        {/* Paper Header */}
        <div className="flex items-start justify-between pb-4 border-b border-gray-300">
          <div className="flex items-center space-x-3">
            <img
              src={selectedCompany?.logo || "/logos/ims.png"}
              alt={selectedCompany?.name || "Company"}
              className="h-12 w-auto object-contain"
            />
            <div className="leading-tight">
              <span className="text-sm font-bold text-gray-900 tracking-tight">
                {selectedCompany?.name?.toLowerCase()}{" "}
                <span className="text-red-600 font-extrabold uppercase">({activeType})</span>
              </span>
              <p className="text-[11px] font-bold text-gray-800 underline uppercase tracking-wide mt-0.5">
                REQUISITION FOR FUND
              </p>
            </div>
          </div>

          <div className="text-right max-w-sm">
            <h2 className="text-xs font-bold text-gray-900">
              {selectedCompany?.legalName}
            </h2>
            <p className="text-[10px] text-gray-600 leading-tight mt-0.5">
              {selectedCompany?.address}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {selectedCompany?.phone && `Phone: ${selectedCompany.phone} • `}
              {selectedCompany?.email && `Email: ${selectedCompany.email}`}
            </p>
            {selectedCompany?.website && (
              <p className="text-[10px] text-gray-500 font-medium">{selectedCompany.website}</p>
            )}
          </div>
        </div>

        {/* Paper Body Fields */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-y-2 text-xs">
          <div className="flex items-center">
            <span className="font-semibold text-gray-700 w-24">Name :</span>
            <span className="font-bold text-gray-900">{user.name}</span>
          </div>
          <div className="flex items-center sm:justify-end">
            <span className="font-semibold text-gray-700 mr-2">Date :</span>
            <span className="font-medium text-gray-900">
              {new Date().toLocaleDateString("en-GB")}
            </span>
          </div>
          <div className="flex items-center">
            <span className="font-semibold text-gray-700 w-24">Designation :</span>
            <span className="text-gray-800">{user.designation}</span>
          </div>
          <div className="flex items-center sm:justify-end">
            <span className="font-semibold text-gray-700 mr-2">Priority :</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs border border-gray-300 rounded px-1.5 py-0.5 font-semibold text-gray-700"
            >
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        {/* Amount & Purpose Header Line */}
        <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-800 space-y-1">
          <div className="flex flex-wrap items-baseline gap-1">
            <span className="font-semibold text-gray-700">An amount Tk.</span>
            <span className="font-bold text-sm text-[#E42528] px-2 py-0.5 bg-red-50 border border-red-200 rounded">
              {formatTaka(calculatedTotal)}
            </span>
            <span className="font-semibold text-gray-700 ml-1">(In word) :</span>
            <span className="italic font-medium text-gray-900 underline underline-offset-2">
              {words || "Zero Taka Only"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-gray-700">
              Is Required for the following purpose which may be sanctioned and disbursed on:
            </span>
            <input
              type="date"
              value={disburseOn}
              onChange={(e) => setDisburseOn(e.target.value)}
              className="border border-gray-300 rounded px-2 py-0.5 text-xs font-semibold text-gray-800 focus:ring-[#E42528] focus:border-[#E42528]"
            />
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-4 border border-gray-400 rounded overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-400 text-gray-700 font-bold uppercase text-[10px]">
                <th className="py-1.5 px-2 w-10 text-center border-r border-gray-300">SL.</th>
                <th className="py-1.5 px-3 border-r border-gray-300">Particulars</th>
                <th className="py-1.5 px-3 border-r border-gray-300 w-1/4">Purpose</th>
                <th className="py-1.5 px-2 border-r border-gray-300 w-16 text-right">Qty.</th>
                <th className="py-1.5 px-2 border-r border-gray-300 w-24 text-right">Unit Price</th>
                <th className="py-1.5 px-3 border-r border-gray-300 w-28 text-right">Amount</th>
                <th className="py-1.5 px-2 w-8 text-center no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {items.map((row, index) => {
                const rowAmt = lineAmount({
                  qty: parseFloat(row.qty) || 0,
                  unitPrice: parseFloat(row.unitPrice) || 0,
                });
                return (
                  <tr key={index} className="hover:bg-gray-50/50">
                    <td className="py-1 px-2 text-center font-semibold text-gray-600 border-r border-gray-300">
                      {row.sl}
                    </td>
                    <td className="py-1 px-2 border-r border-gray-300">
                      <input
                        type="text"
                        required
                        placeholder="Item or service description"
                        value={row.particulars}
                        onChange={(e) => handleRowChange(index, "particulars", e.target.value)}
                        className="w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E42528] rounded text-xs"
                      />
                    </td>
                    <td className="py-1 px-2 border-r border-gray-300">
                      <input
                        type="text"
                        placeholder="Specific purpose"
                        value={row.purpose}
                        onChange={(e) => handleRowChange(index, "purpose", e.target.value)}
                        className="w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E42528] rounded text-xs"
                      />
                    </td>
                    <td className="py-1 px-1 border-r border-gray-300">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={row.qty}
                        onChange={(e) => handleRowChange(index, "qty", e.target.value)}
                        className="w-full text-right px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E42528] rounded text-xs font-semibold"
                      />
                    </td>
                    <td className="py-1 px-1 border-r border-gray-300">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={row.unitPrice}
                        onChange={(e) => handleRowChange(index, "unitPrice", e.target.value)}
                        className="w-full text-right px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E42528] rounded text-xs font-semibold"
                      />
                    </td>
                    <td className="py-1 px-3 text-right font-bold text-gray-900 border-r border-gray-300">
                      {formatTaka(rowAmt)}
                    </td>
                    <td className="py-1 px-1 text-center no-print">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-red-500 hover:text-red-700 font-bold px-1"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Total row matching paper layout */}
              <tr className="bg-gray-100 font-bold text-xs border-t-2 border-gray-400">
                <td colSpan={5} className="py-2 px-4 text-right uppercase tracking-wider border-r border-gray-300">
                  Total
                </td>
                <td className="py-2 px-3 text-right text-sm text-[#E42528] font-extrabold border-r border-gray-300">
                  {formatTaka(calculatedTotal)}
                </td>
                <td className="no-print"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex justify-between items-center no-print">
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-semibold text-[#E42528] hover:text-[#B81D20] bg-red-50 hover:bg-red-100 px-3 py-1 rounded border border-red-200 cursor-pointer"
          >
            + Add Another Item
          </button>
        </div>

        {/* Comments Box */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-700">Comments:</label>
          <textarea
            rows={2}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Justification, supplier quote notes, or remarks..."
            className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-[#E42528] focus:border-[#E42528]"
          />
        </div>

        {/* Paper Signature Row (5 boxes) */}
        <div className="mt-8 pt-4 border-t border-gray-400">
          <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
            <div className="border-t border-gray-800 pt-1">
              <span className="font-semibold block text-gray-800">Requested by</span>
              <span className="text-[10px] text-gray-500">{user.name}</span>
            </div>
            <div className="border-t border-gray-400 pt-1">
              <span className="font-semibold block text-gray-800">Checked by</span>
              <span className="text-[10px] text-gray-400">Dept / Project Head</span>
            </div>
            <div className="border-t border-gray-400 pt-1">
              <span className="font-semibold block text-gray-800">Checked by</span>
              <span className="text-[10px] text-gray-400">Sr. Mgr / Checker</span>
            </div>
            <div className="border-t border-gray-400 pt-1">
              <span className="font-semibold block text-gray-800">Checked by Accounts</span>
              <span className="text-[10px] text-gray-400">Accounts Manager</span>
            </div>
            <div className="border-t border-gray-400 pt-1">
              <span className="font-semibold block text-gray-800">Approve by management</span>
              <span className="text-[10px] text-gray-400">Director & MD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attachments & Submission Options */}
      <div className="mt-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-gray-800">
              Attach Quotations / Bills (PDF, PNG, JPG)
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Max 200 KB per file
              </span>
            </label>
            <span className="text-[11px] text-gray-400">
              💡 Tip: Use <a href="https://tinyjpg.com" target="_blank" rel="noreferrer" className="underline text-blue-600">TinyJPG.com</a> or <a href="https://www.ilovepdf.com/compress_pdf" target="_blank" rel="noreferrer" className="underline text-blue-600">ILovePDF</a> to resize
            </span>
          </div>

          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="mt-2 text-xs text-gray-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />

          {attachmentError && (
            <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center space-x-1.5">
              <span>⚠️</span>
              <span>{attachmentError}</span>
            </div>
          )}

          {/* List of currently selected attachments */}
          {attachments.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs"
                >
                  <span className="text-gray-500">📎</span>
                  <span className="font-semibold text-gray-800 max-w-[180px] truncate">{file.name}</span>
                  <span className="text-[10px] font-mono text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="ml-1 text-gray-400 hover:text-red-600 font-bold cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={() => {
              setSubmitAction("DRAFT");
              setShowSignModal(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 cursor-pointer"
          >
            Save as Draft
          </button>

          <button
            type="button"
            onClick={() => {
              if (attachmentError) return;
              setSubmitAction("SUBMIT");
              setShowSignModal(true);
            }}
            className="px-5 py-2 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md shadow cursor-pointer transition-colors"
          >
            Digitally Sign & Submit Voucher
          </button>
        </div>
      </div>

      {/* Signature Confirmation Modal */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
              <span>✍️</span>
              <span>
                {submitAction === "SUBMIT" ? "Digitally Sign & Submit" : "Save Requisition as Draft"}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Please enter your 4-digit PIN (or account password) to authenticate your digital signature.
            </p>

            {user.signature ? (
              <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded text-center">
                <span className="text-[10px] text-gray-500 block mb-0.5">Your Signature:</span>
                <img src={user.signature} alt="Signature" className="h-12 w-auto mx-auto object-contain" />
              </div>
            ) : (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                Notice: You haven't drawn a signature in your profile yet. Your digital identity stamp will be used.
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700">
                Enter 4-Digit PIN or Password
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

            <div className="mt-5 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !pinOrPassword}
                onClick={handleFinalSubmit}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50"
              >
                {isSubmitting ? "Processing..." : "Confirm & Sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
