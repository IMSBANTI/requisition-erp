"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { amountInWords } from "@/lib/numberToWords";
import { lineAmount, grandTotal, formatTaka } from "@/lib/money";
import { CATEGORIES } from "@/lib/constants";
import {
  CostHeadConfig,
  DEFAULT_PROJECT_COST_HEADS,
  DEFAULT_EVENT_COST_HEADS,
  resolveCostHeadsForKind,
  calculateProfitSummary,
  calculateVariance,
} from "@/lib/profitEngine";

interface FormProps {
  user: {
    id: string;
    name: string;
    designation: string;
    signature: string | null;
    hasPin: boolean;
    priorityLevel?: number;
    isManager?: boolean;
    companyId?: string | null;
    departmentId?: string | null;
    departmentName?: string;
    secondaryDepartments?: string[];
    permissions?: string[];
  };
  companies: any[];
  departments?: any[];
  projects: any[];
}

interface ItemRow {
  sl: number;
  costHead: string;
  costTag: "BILLABLE" | "IMS_INVESTMENT";
  forMonth: string;
  lastMonthAmount: number;
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
  "TP-OPS",
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

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getPreviousYearMonth(ym: string): string {
  const [yStr, mStr] = (ym || getCurrentYearMonth()).split("-");
  let y = parseInt(yStr, 10) || new Date().getFullYear();
  let m = parseInt(mStr, 10) || 1;
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function RequisitionForm({
  user,
  companies,
  departments = [],
  projects,
}: FormProps) {
  const router = useRouter();

  // Separate client projects & events (excluding internal company division buckets)
  const projectBasedList = useMemo(() => {
    const list = projects.filter(
      (p) =>
        !COMPANY_DIVISION_CODES.has(p.code) &&
        !p.code.endsWith("-CORP") &&
        p.name.toLowerCase() !== "tradepulse"
    );
    return list.length > 0 ? list : projects;
  }, [projects]);

  const onlyProjectsList = useMemo(
    () =>
      projectBasedList.filter(
        (p) => p.kind !== "EVENT" && !p.code?.toUpperCase().startsWith("EVT-")
      ),
    [projectBasedList]
  );

  const onlyEventsList = useMemo(
    () =>
      projectBasedList.filter(
        (p) => p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-")
      ),
    [projectBasedList]
  );

  // Resolve which of the 3 separate Requisition Types this user is allowed to use: COMPANY | PROJECT | EVENT
  const allowedModes = useMemo<Array<"COMPANY" | "PROJECT" | "EVENT">>(() => {
    const perms = user.permissions || [];
    const hasGranularTypeFlags = perms.some((p) => p.startsWith("req.type."));
    if (hasGranularTypeFlags) {
      const modes: Array<"COMPANY" | "PROJECT" | "EVENT"> = [];
      if (perms.includes("req.type.company")) modes.push("COMPANY");
      if (perms.includes("req.type.project")) modes.push("PROJECT");
      if (perms.includes("req.type.event")) modes.push("EVENT");
      if (modes.length > 0) return modes;
    }

    if (perms.includes("req.mode.company")) return ["COMPANY"];
    if (perms.includes("req.mode.project")) {
      const modes: Array<"COMPANY" | "PROJECT" | "EVENT"> = [];
      if (onlyProjectsList.length > 0) modes.push("PROJECT");
      if (onlyEventsList.length > 0) modes.push("EVENT");
      return modes.length > 0 ? modes : ["PROJECT"];
    }
    if (perms.includes("req.mode.ops_events")) return ["COMPANY", "PROJECT", "EVENT"];
    if (perms.includes("req.mode.both")) return ["COMPANY", "PROJECT", "EVENT"];

    const deptText = [user.departmentName || "", ...(user.secondaryDepartments || [])]
      .join(" ")
      .toLowerCase();

    if ((user.priorityLevel ?? 2) >= 4) {
      return ["COMPANY", "PROJECT", "EVENT"];
    }
    if (deptText.includes("operation") || deptText.includes("event")) {
      return ["COMPANY", "PROJECT", "EVENT"];
    }
    if (deptText.includes("project ")) {
      return ["PROJECT"];
    }
    if (user.isManager) {
      return ["COMPANY", "PROJECT", "EVENT"];
    }

    const assignedModes: Array<"COMPANY" | "PROJECT" | "EVENT"> = [];
    if (onlyProjectsList.length > 0) assignedModes.push("PROJECT");
    if (onlyEventsList.length > 0) assignedModes.push("EVENT");
    if (assignedModes.length > 0) return assignedModes;

    return ["COMPANY"];
  }, [
    user.permissions,
    user.departmentName,
    user.secondaryDepartments,
    user.priorityLevel,
    user.isManager,
    onlyProjectsList.length,
    onlyEventsList.length,
  ]);

  const canSwitchModeAndFilter = allowedModes.length > 1;

  // Determine initial mode among user's allowed modes
  const initialMode = useMemo<"COMPANY" | "PROJECT" | "EVENT">(() => {
    if (allowedModes.length === 1) return allowedModes[0];
    const deptText = [user.departmentName || "", ...(user.secondaryDepartments || [])]
      .join(" ")
      .toLowerCase();
    if (deptText.includes("event") && allowedModes.includes("EVENT")) return "EVENT";
    if (
      (deptText.includes("outsourcing") ||
        deptText.includes("project ") ||
        deptText.includes("operation")) &&
      allowedModes.includes("PROJECT")
    ) {
      return "PROJECT";
    }
    if (allowedModes.includes("COMPANY")) return "COMPANY";
    return allowedModes[0];
  }, [allowedModes, user.departmentName, user.secondaryDepartments]);

  const [requisitionMode, setRequisitionMode] = useState<"COMPANY" | "PROJECT" | "EVENT">(
    initialMode
  );

  const [departmentId, setDepartmentId] = useState<string>(
    user.departmentId || departments[0]?.id || ""
  );

  const [projectId, setProjectId] = useState(() => {
    if (initialMode === "EVENT") {
      return onlyEventsList[0]?.id || projectBasedList[0]?.id || projects[0]?.id || "";
    }
    return onlyProjectsList[0]?.id || projectBasedList[0]?.id || projects[0]?.id || "";
  });
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

  // Service Month for Project Requisitions
  const [forMonth, setForMonth] = useState<string>(getCurrentYearMonth());
  const [changeReason, setChangeReason] = useState<string>("");

  // Active Cost Heads for the selected Project or Event (strictly separated)
  const activeCostHeads = useMemo<CostHeadConfig[]>(() => {
    if (requisitionMode === "COMPANY") return [];
    const isEvt = requisitionMode === "EVENT";
    return resolveCostHeadsForKind(selectedProject?.costHeads, isEvt);
  }, [requisitionMode, selectedProject]);

  function buildDefaultRowForTarget(
    mode: "COMPANY" | "PROJECT" | "EVENT",
    targetProj: any
  ): ItemRow {
    if (mode === "COMPANY") {
      return {
        sl: 1,
        costHead: "",
        costTag: "BILLABLE",
        forMonth,
        lastMonthAmount: 0,
        particulars: "",
        purpose: "",
        qty: "1",
        unitPrice: "0",
      };
    }
    const heads = resolveCostHeadsForKind(targetProj?.costHeads, mode === "EVENT");
    const firstHead = heads[0];
    const lag = targetProj?.salaryMonthLag ?? (mode === "EVENT" ? 0 : 1);
    return {
      sl: 1,
      costHead: firstHead?.name || "",
      costTag: firstHead?.tag || "BILLABLE",
      forMonth:
        mode === "PROJECT" && firstHead?.isSalary && lag === 1
          ? getPreviousYearMonth(forMonth)
          : forMonth,
      lastMonthAmount: 0,
      particulars: firstHead?.name || "",
      purpose: "",
      qty: "1",
      unitPrice: "0",
    };
  }

  // Switch between IMS Group Company, Project Requisition, & Event Requisition
  function handleModeChange(mode: "COMPANY" | "PROJECT" | "EVENT") {
    setRequisitionMode(mode);
    setChangeReason("");
    if (mode === "COMPANY") {
      const compId =
        user.companyId || companies.find((c) => c.code === "IMS")?.id || companies[0]?.id || "";
      setCompanyId(compId);
      const deptObj = departments.find((d) => d.id === departmentId);
      const inferredCat = inferCategoryFromDepartment(deptObj?.name || user.departmentName || "");
      setCategory(inferredCat);
      setType(
        inferredCat === "AI_IT"
          ? "IT"
          : inferredCat === "STUDIO"
          ? "STUDIO"
          : inferredCat === "OPERATIONS_EVENT"
          ? "OPERATION"
          : "ADMIN"
      );
      setItems([buildDefaultRowForTarget("COMPANY", null)]);
    } else if (mode === "PROJECT") {
      const firstProj = onlyProjectsList[0] || projectBasedList[0] || projects[0];
      if (firstProj) {
        setProjectId(firstProj.id);
        setCompanyId(firstProj.companyId);
        setCategory(
          firstProj.category === "IMS_OUTSOURCING_STUDIO"
            ? "OUTSOURCING"
            : firstProj.category || "OUTSOURCING"
        );
        setType(firstProj.requisitionTypes?.[0] || "BPO");
        setItems([buildDefaultRowForTarget("PROJECT", firstProj)]);
      }
    } else if (mode === "EVENT") {
      const firstEvt = onlyEventsList[0] || projectBasedList[0] || projects[0];
      if (firstEvt) {
        setProjectId(firstEvt.id);
        setCompanyId(firstEvt.companyId);
        setCategory(firstEvt.category || "OPERATIONS_EVENT");
        setType(firstEvt.requisitionTypes?.[0] || "EVENT");
        setItems([buildDefaultRowForTarget("EVENT", firstEvt)]);
      }
    }
  }

  function handleProjectChange(id: string) {
    setProjectId(id);
    setChangeReason("");
    const p = projects.find((x) => x.id === id);
    if (p) {
      setCategory(
        p.category === "IMS_OUTSOURCING_STUDIO" ? "OUTSOURCING" : p.category || "OUTSOURCING"
      );
      setType(p.requisitionTypes?.[0] || (requisitionMode === "EVENT" ? "EVENT" : "BPO"));
      // If user hasn't entered amounts yet, refresh the default Cost Head row for the newly selected Project/Event
      const hasEnteredPrices = items.some((it) => (parseFloat(it.unitPrice) || 0) > 0);
      if (!hasEnteredPrices) {
        setItems([buildDefaultRowForTarget(requisitionMode, p)]);
      }
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
      else if (cat === "OPERATIONS_EVENT") setType("EVENT");
      else setType("ADMIN");
    }
  }

  const initialCat =
    initialMode === "EVENT"
      ? selectedProject?.category || "OPERATIONS_EVENT"
      : initialMode === "PROJECT"
      ? selectedProject?.category === "IMS_OUTSOURCING_STUDIO"
        ? "OUTSOURCING"
        : selectedProject?.category || "OUTSOURCING"
      : inferCategoryFromDepartment(user.departmentName || "");

  const [type, setType] = useState(
    initialMode === "EVENT"
      ? selectedProject?.requisitionTypes?.[0] || "EVENT"
      : initialMode === "PROJECT"
      ? selectedProject?.requisitionTypes?.[0] || "BPO"
      : initialCat === "AI_IT"
      ? "IT"
      : initialCat === "STUDIO"
      ? "STUDIO"
      : initialCat === "OPERATIONS_EVENT"
      ? "OPERATION"
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
    {
      sl: 1,
      costHead: activeCostHeads[0]?.name || "",
      costTag: activeCostHeads[0]?.tag || "BILLABLE",
      forMonth:
        activeCostHeads[0]?.isSalary && (selectedProject?.salaryMonthLag ?? 1) === 1
          ? getPreviousYearMonth(getCurrentYearMonth())
          : getCurrentYearMonth(),
      lastMonthAmount: 0,
      particulars: activeCostHeads[0]?.name || "",
      purpose: "",
      qty: "1",
      unitPrice: "0",
    },
  ]);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poFile, setPoFile] = useState<File | null>(null);
  const [poError, setPoError] = useState("");
  const [pinOrPassword, setPinOrPassword] = useState("");
  const [showSignModal, setShowSignModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"SUBMIT" | "DRAFT">("SUBMIT");
  const [error, setError] = useState("");

  // Pre-fill lines from Last Month Requisition or Configured Cost Heads
  function handlePrefillCostHeads() {
    const lastReq = selectedProject?.lastRequisition;
    const lag = selectedProject?.salaryMonthLag ?? 1;
    const prevMonth = getPreviousYearMonth(forMonth);

    if (requisitionMode === "PROJECT" && lastReq && Array.isArray(lastReq.items) && lastReq.items.length > 0) {
      const prefilled: ItemRow[] = lastReq.items.map((it: any, i: number) => {
        const matchedHead = activeCostHeads.find(
          (ch) => ch.name.toLowerCase() === (it.costHead || it.particulars || "").toLowerCase()
        );
        const isSal = matchedHead?.isSalary ?? false;
        return {
          sl: i + 1,
          costHead: it.costHead || matchedHead?.name || it.particulars,
          costTag: (it.costTag || matchedHead?.tag || "BILLABLE") as "BILLABLE" | "IMS_INVESTMENT",
          forMonth: isSal && lag === 1 ? prevMonth : forMonth,
          lastMonthAmount: Number(it.amount || 0),
          particulars: it.particulars || it.costHead || "",
          purpose: it.purpose || `For ${isSal && lag === 1 ? prevMonth : forMonth}`,
          qty: String(it.qty || 1),
          unitPrice: String(it.unitPrice || it.amount || 0),
        };
      });
      setItems(prefilled);
      return;
    }

    // Otherwise populate all standard Cost Heads for this Project or Event
    const templateRows: ItemRow[] = activeCostHeads.map((ch, i) => {
      const lineM =
        requisitionMode === "PROJECT" && ch.isSalary && lag === 1 ? prevMonth : forMonth;
      return {
        sl: i + 1,
        costHead: ch.name,
        costTag: ch.tag,
        forMonth: lineM,
        lastMonthAmount: ch.defaultAmount || 0,
        particulars: ch.name,
        purpose:
          requisitionMode === "PROJECT"
            ? ch.isSalary && lag === 1
              ? `Salary for ${lineM} (Lag 1m)`
              : `Project expense for ${lineM}`
            : `Event execution — ${ch.name}`,
        qty: "1",
        unitPrice: String(ch.defaultAmount || 0),
      };
    });
    if (templateRows.length > 0) {
      setItems(templateRows);
    }
  }

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

  function handlePoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPoError("");
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const MAX_KB = 200;
    if (file.size > MAX_KB * 1024) {
      setPoError(
        `Purchase Order file "${file.name}" is ${(file.size / 1024).toFixed(0)} KB. Maximum allowed size is 200 KB. Please compress or resize before attaching.`
      );
      e.target.value = "";
      return;
    }
    setPoFile(file);
    e.target.value = "";
  }

  function removePoFile() {
    setPoFile(null);
    setPoError("");
  }

  // Grand Total & Billable vs. IMS Investment Breakdown
  const calculatedTotal = useMemo(() => {
    return grandTotal(
      items.map((it) => ({
        qty: parseFloat(it.qty) || 0,
        unitPrice: parseFloat(it.unitPrice) || 0,
      }))
    );
  }, [items]);

  const { billableTotal, imsInvestmentTotal } = useMemo(() => {
    let billable = 0;
    let imsInv = 0;
    for (const it of items) {
      const amt = (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0);
      if (it.costTag === "IMS_INVESTMENT") {
        imsInv += amt;
      } else {
        billable += amt;
      }
    }
    return { billableTotal: billable, imsInvestmentTotal: imsInv };
  }, [items]);

  // Live Project / Event Profit & Billing Calculation
  const profitSummary = useMemo(() => {
    if (requisitionMode === "COMPANY" || !selectedProject) return null;

    // For Event FIXED_QUOTE, if fixedMonthlyBill isn't set separately, fall back to project.budget
    const effectiveFixedBill =
      selectedProject.fixedMonthlyBill && selectedProject.fixedMonthlyBill > 0
        ? selectedProject.fixedMonthlyBill
        : selectedProject.billingProfile === "FIXED_QUOTE" && selectedProject.budget > 0
        ? selectedProject.budget
        : 0;

    return calculateProfitSummary({
      terms: {
        billingProfile: selectedProject.billingProfile || "COST_PLUS",
        feeRate: selectedProject.feeRate ?? 0.08,
        aitRate: selectedProject.aitRate ?? 0.012,
        vatRate: selectedProject.vatRate ?? 0.15,
        billCycleDays: selectedProject.billCycleDays ?? 30,
        funding: selectedProject.funding || "POSTPAID",
        salaryMonthLag: selectedProject.salaryMonthLag ?? 1,
        fixedMonthlyBill: effectiveFixedBill,
        maintenanceBudget: selectedProject.maintenanceBudget ?? 0,
        monthlyAmortization: selectedProject.monthlyAmortization ?? 0,
        varianceThresholdPct: selectedProject.varianceThresholdPct ?? 10,
      },
      billableCost: billableTotal,
      imsInvestment: imsInvestmentTotal,
    });
  }, [requisitionMode, selectedProject, billableTotal, imsInvestmentTotal]);

  // Variance Calculation:
  // - For PROJECT mode: compares against Last Month Requisition Total (or sum of lastMonthAmount)
  // - For EVENT mode: compares Cumulative Event Spend (Prior Event Spend + Current Total) vs Approved Event Budget
  const varianceSummary = useMemo(() => {
    if (requisitionMode === "COMPANY" || !selectedProject) return null;

    const rowLastMonthSum = items.reduce((s, it) => s + (Number(it.lastMonthAmount) || 0), 0);
    if (requisitionMode === "PROJECT") {
      const lastMonthBaseline =
        rowLastMonthSum > 0
          ? rowLastMonthSum
          : selectedProject.lastRequisition?.total || selectedProject.budget || 0;
      return {
        baselineLabel: selectedProject.lastRequisition
          ? `Last Month (${selectedProject.lastRequisition.forMonth || selectedProject.lastRequisition.number || "Prior"})`
          : selectedProject.budget > 0
          ? "Monthly Target Budget"
          : "Last Month Baseline",
        baselineTotal: lastMonthBaseline,
        ...calculateVariance({
          currentTotal: calculatedTotal.toNumber(),
          baselineTotal: lastMonthBaseline,
          thresholdPct: selectedProject.varianceThresholdPct ?? 10,
          mode: "PROJECT",
        }),
      };
    } else {
      // EVENT mode
      const priorSpend = Number(selectedProject.cumulativeSpend || 0);
      const cumulativeEventTotal = priorSpend + calculatedTotal.toNumber();
      const eventBudget = Number(selectedProject.budget || selectedProject.fixedMonthlyBill || 0);
      return {
        baselineLabel: "Approved Event Budget",
        baselineTotal: eventBudget,
        priorSpend,
        cumulativeEventTotal,
        ...calculateVariance({
          currentTotal: cumulativeEventTotal,
          baselineTotal: eventBudget,
          thresholdPct: selectedProject.varianceThresholdPct ?? 10,
          mode: "EVENT",
        }),
      };
    }
  }, [requisitionMode, selectedProject, items, calculatedTotal]);

  const words = useMemo(() => {
    try {
      return amountInWords(calculatedTotal);
    } catch {
      return "";
    }
  }, [calculatedTotal]);

  function handleRowChange(index: number, field: keyof ItemRow, val: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };

    // If costHead changed, auto-sync costTag, particulars (if empty or matching old costHead), and lagged month
    if (field === "costHead" && typeof val === "string") {
      const matched = activeCostHeads.find((ch) => ch.name === val);
      if (matched) {
        updated[index].costTag = matched.tag;
        if (
          !updated[index].particulars ||
          activeCostHeads.some((ch) => ch.name === updated[index].particulars)
        ) {
          updated[index].particulars = matched.name;
        }
        if (requisitionMode === "PROJECT") {
          const lag = selectedProject?.salaryMonthLag ?? 1;
          updated[index].forMonth =
            matched.isSalary && lag === 1 ? getPreviousYearMonth(forMonth) : forMonth;
        }
      }
    }

    setItems(updated);
  }

  function addRow() {
    const defaultCh = requisitionMode === "PROJECT" ? activeCostHeads[0] : undefined;
    setItems((prev) => [
      ...prev,
      {
        sl: prev.length + 1,
        costHead: defaultCh?.name || "",
        costTag: defaultCh?.tag || "BILLABLE",
        forMonth:
          requisitionMode === "PROJECT" &&
          defaultCh?.isSalary &&
          (selectedProject?.salaryMonthLag ?? 1) === 1
            ? getPreviousYearMonth(forMonth)
            : forMonth,
        lastMonthAmount: 0,
        particulars: "",
        purpose: "",
        qty: "1",
        unitPrice: "0",
      },
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

      if (requisitionMode !== "COMPANY") {
        if (poNumber.trim()) {
          formData.append("poNumber", poNumber.trim());
        }
        if (poFile) {
          formData.append("poFile", poFile);
        }
        formData.append("forMonth", forMonth);
        formData.append("changeReason", changeReason.trim());
        formData.append("billableTotal", String(billableTotal));
        formData.append("imsInvestmentTotal", String(imsInvestmentTotal));
        if (varianceSummary?.baselineTotal !== undefined) {
          formData.append("lastMonthTotal", String(varianceSummary.baselineTotal));
        }
        if (varianceSummary?.variancePct !== null && varianceSummary?.variancePct !== undefined) {
          formData.append("variancePct", String(varianceSummary.variancePct));
        }
        if (profitSummary) {
          formData.append("projectedBillExVat", String(profitSummary.billExVat));
          formData.append("projectedNetProfit", String(profitSummary.netProfit));
        }
      }

      formData.append(
        "items",
        JSON.stringify(
          items.map((it) => ({
            sl: it.sl,
            costHead: requisitionMode === "COMPANY" ? null : it.costHead || it.particulars,
            costTag: requisitionMode === "COMPANY" ? "BILLABLE" : it.costTag || "BILLABLE",
            forMonth: requisitionMode === "PROJECT" ? it.forMonth || forMonth : null,
            lastMonthAmount:
              requisitionMode !== "COMPANY" && it.lastMonthAmount ? Number(it.lastMonthAmount) : null,
            particulars: it.particulars || it.costHead,
            purpose: requisitionMode !== "COMPANY" ? (it.purpose || it.particulars) : it.purpose,
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
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-[#E42528] text-xs font-semibold text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Requisition Type Selector: IMS Group Company vs. Project Requisition vs. Event Requisition */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4">
        {canSwitchModeAndFilter && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <span className="text-xs font-bold text-gray-900 block">
                1. Choose Requisition Type
              </span>
              <span className="text-[11px] text-gray-500">
                Select whether this requisition is for an IMS Group Company, a Project, or an Event.
              </span>
            </div>
            <div className="inline-flex flex-wrap rounded-lg p-1 bg-gray-100 border border-gray-200 gap-1">
              {allowedModes.includes("COMPANY") && (
                <button
                  type="button"
                  onClick={() => handleModeChange("COMPANY")}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    requisitionMode === "COMPANY"
                      ? "bg-[#E42528] text-white shadow-xs"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  🏢 IMS Group Company
                </button>
              )}
              {allowedModes.includes("PROJECT") && (
                <button
                  type="button"
                  onClick={() => handleModeChange("PROJECT")}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    requisitionMode === "PROJECT"
                      ? "bg-gray-900 text-white shadow-xs"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  📁 Project Requisition
                </button>
              )}
              {allowedModes.includes("EVENT") && (
                <button
                  type="button"
                  onClick={() => handleModeChange("EVENT")}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    requisitionMode === "EVENT"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  🎪 Event Requisition
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {requisitionMode === "COMPANY" ? (
            <>
              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Sister Concern
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

              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Department / Division
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
          ) : requisitionMode === "PROJECT" ? (
            <>
              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Sister Concern
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

              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Select Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {(onlyProjectsList.length > 0 ? onlyProjectsList : projectBasedList).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Sister Concern
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

              <div className="min-w-0">
                <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                  Select Event
                </label>
                <select
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
                >
                  {(onlyEventsList.length > 0 ? onlyEventsList : projectBasedList).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="min-w-0">
            <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
              Requisition Tag / Type
            </label>
            <div className="flex space-x-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 block w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white focus:ring-[#E42528] focus:border-[#E42528]"
              >
                {(requisitionMode === "COMPANY"
                  ? ["ADMIN", "CASH", "BPO", "OPERATION", "IT", "STUDIO"]
                  : requisitionMode === "EVENT"
                  ? selectedProject?.requisitionTypes || ["EVENT", "CASH", "ADMIN"]
                  : selectedProject?.requisitionTypes?.filter((t: string) => t !== "EVENT") || [
                      "BPO",
                      "ADMIN",
                      "CASH",
                    ]
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

          <div className="min-w-0">
            <label className="block h-5 leading-5 text-xs font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis mb-1">
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

        {/* Project / Event Calculation Bar (Service Month, Pre-fill & Billing Profile Info) */}
        {requisitionMode !== "COMPANY" && selectedProject && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {requisitionMode === "PROJECT" && (
                <div className="flex items-center space-x-2">
                  <label className="text-xs font-bold text-gray-700">Service Month:</label>
                  <input
                    type="month"
                    value={forMonth}
                    onChange={(e) => setForMonth(e.target.value)}
                    className="h-8 px-2.5 py-1 border border-gray-300 rounded-md text-xs font-bold bg-white"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <label className="text-xs font-bold text-gray-700">Payment Type:</label>
                <div className="inline-flex rounded-md border border-gray-300 p-0.5 bg-white">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("CASH")}
                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                      paymentMode === "CASH"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    💵 CASH
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode("CHEQUE")}
                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                      paymentMode === "CHEQUE"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    📝 CHEQUE
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePrefillCostHeads}
                className="px-3 py-1.5 text-xs font-bold text-gray-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md shadow-2xs cursor-pointer transition-colors"
              >
                {requisitionMode === "PROJECT"
                  ? "↺ Load Project Cost Head Lines"
                  : "↺ Load Event Cost Head Lines"}
              </button>
            </div>
          </div>
        )}
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
          <div className="flex items-center sm:justify-end gap-3">
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-1.5">Priority :</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="text-xs border border-gray-300 rounded px-1.5 py-0.5 font-semibold text-gray-700"
              >
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div className="flex items-center">
              <span className="font-semibold text-gray-700 mr-1.5">Payment Type :</span>
              <div className="inline-flex rounded-md border border-gray-300 p-0.5 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setPaymentMode("CASH")}
                  className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                    paymentMode === "CASH"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  💵 CASH
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("CHEQUE")}
                  className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${
                    paymentMode === "CHEQUE"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📝 CHEQUE
                </button>
              </div>
            </div>
          </div>

          {requisitionMode !== "COMPANY" && (
            <div className="flex flex-wrap items-center col-span-1 sm:col-span-2 pt-2 border-t border-gray-200 gap-2">
              <span className="font-semibold text-gray-700 w-24">PO / WO Ref :</span>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Client Purchase Order # or Work Order Ref (Optional / Recommended)"
                className="max-w-md w-full px-2 py-0.5 border border-gray-300 rounded text-xs font-semibold text-gray-900 bg-white focus:border-[#E42528]"
              />
              {poFile && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[11px] font-bold">
                  <span>📄 PO Document Attached:</span>
                  <span className="truncate max-w-[140px]">{poFile.name}</span>
                </span>
              )}
            </div>
          )}
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
        {requisitionMode === "EVENT" && (
          <datalist id="event-cost-heads-datalist">
            {activeCostHeads.map((ch) => (
              <option key={ch.id} value={ch.name} />
            ))}
          </datalist>
        )}
        <div className="mt-4 border border-gray-400 rounded overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-400 text-gray-700 font-bold uppercase text-[10px]">
                <th className="py-1.5 px-2 w-9 text-center border-r border-gray-300">SL.</th>
                {requisitionMode !== "COMPANY" && (
                  <>
                    <th className="py-1.5 px-2 border-r border-gray-300 w-44">
                      {requisitionMode === "EVENT" ? "Event Cost Head" : "Project Cost Head"}
                    </th>
                    <th className="py-1.5 px-2 border-r border-gray-300 w-24 text-center">
                      Cost Type
                    </th>
                  </>
                )}
                <th className="py-1.5 px-3 border-r border-gray-300">Particulars</th>
                {requisitionMode === "COMPANY" && (
                  <th className="py-1.5 px-3 border-r border-gray-300 w-40">Purpose</th>
                )}
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

                    {requisitionMode !== "COMPANY" && (
                      <>
                        <td className="py-1 px-1.5 border-r border-gray-300">
                          {requisitionMode === "EVENT" ? (
                            <input
                              type="text"
                              list="event-cost-heads-datalist"
                              placeholder="Select or type Event Cost Head..."
                              value={row.costHead}
                              onChange={(e) => handleRowChange(index, "costHead", e.target.value)}
                              className="w-full px-1.5 py-0.5 border border-gray-200 focus:border-[#E42528] rounded text-[11px] font-semibold bg-white"
                            />
                          ) : (
                            <select
                              value={row.costHead}
                              onChange={(e) => handleRowChange(index, "costHead", e.target.value)}
                              className="w-full px-1.5 py-0.5 border border-gray-200 rounded text-[11px] font-semibold bg-white"
                            >
                              <option value="">-- Custom Item --</option>
                              {activeCostHeads.map((ch) => (
                                <option key={ch.id} value={ch.name}>
                                  {ch.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-1 px-1.5 border-r border-gray-300 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleRowChange(
                                index,
                                "costTag",
                                row.costTag === "BILLABLE" ? "IMS_INVESTMENT" : "BILLABLE"
                              )
                            }
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border cursor-pointer ${
                              row.costTag === "IMS_INVESTMENT"
                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                : "bg-green-50 text-green-800 border-green-300"
                            }`}
                            title="Click to toggle between BILLABLE (Client Billed) and IMS_INVESTMENT (IMS Cost)"
                          >
                            {row.costTag === "IMS_INVESTMENT" ? "IMS INV." : "BILLABLE"}
                          </button>
                        </td>
                      </>
                    )}

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
                    {requisitionMode === "COMPANY" && (
                      <td className="py-1 px-2 border-r border-gray-300">
                        <input
                          type="text"
                          placeholder="Specific purpose"
                          value={row.purpose}
                          onChange={(e) => handleRowChange(index, "purpose", e.target.value)}
                          className="w-full px-1.5 py-0.5 border border-transparent hover:border-gray-300 focus:border-[#E42528] rounded text-xs"
                        />
                      </td>
                    )}

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
                <td
                  colSpan={requisitionMode !== "COMPANY" ? 6 : 5}
                  className="py-2 px-4 text-right uppercase tracking-wider border-r border-gray-300"
                >
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
        {/* Dedicated Purchase Order (PO) / Work Order Section for Project & Event Requisitions */}
        {requisitionMode !== "COMPANY" && (
          <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📄</span>
                <div>
                  <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wide flex items-center gap-1.5">
                    <span>Client Purchase Order (PO) / Work Order</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-blue-600 text-white">
                      {requisitionMode === "EVENT" ? "EVENT PO" : "PROJECT PO"}
                    </span>
                  </h4>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    Upload the official Purchase Order (PO) or Work Order received from the client for this {requisitionMode === "EVENT" ? "event" : "project"}.
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-blue-800 border border-blue-200 shadow-2xs">
                Max 200 KB (PDF, PNG, JPG)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-blue-200/60">
              <div>
                <label className="block text-[11px] font-bold text-blue-900 mb-1">
                  PO / Work Order Reference #
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-BL-2026-101 / WO-GP-442"
                  className="w-full px-2.5 py-1.5 border border-blue-300 rounded-md text-xs font-semibold text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-blue-900 mb-1">
                  Upload PO File
                </label>
                {!poFile ? (
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handlePoFileChange}
                    className="w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                  />
                ) : (
                  <div className="flex items-center justify-between p-1.5 bg-white border border-blue-300 rounded-md text-xs">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className="text-blue-600 font-bold">📄</span>
                      <span className="font-bold text-blue-950 truncate max-w-[200px]">
                        {poFile.name}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500">
                        ({(poFile.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removePoFile}
                      className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 text-xs cursor-pointer"
                      title="Remove PO file"
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {poError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">
                ⚠️ {poError}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-gray-800">
              Attach Quotations / Bills (PDF, PNG, JPG)
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Max 200 KB per file
              </span>
            </label>
            <span className="text-[11px] text-gray-400">
              💡 Tip: Use{" "}
              <a
                href="https://tinyjpg.com"
                target="_blank"
                rel="noreferrer"
                className="underline text-blue-600"
              >
                TinyJPG.com
              </a>{" "}
              or{" "}
              <a
                href="https://www.ilovepdf.com/compress_pdf"
                target="_blank"
                rel="noreferrer"
                className="underline text-blue-600"
              >
                ILovePDF
              </a>{" "}
              to resize
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
                  <span className="font-semibold text-gray-800 max-w-[180px] truncate">
                    {file.name}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
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
              if (varianceSummary?.requiresReason && !changeReason.trim()) {
                setError(varianceSummary.reasonPrompt);
                return;
              }
              setError("");
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
                {submitAction === "SUBMIT"
                  ? "Digitally Sign & Submit"
                  : "Save Requisition as Draft"}
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Please enter your 4-digit PIN (or account password) to authenticate your digital signature.
            </p>

            {user.signature ? (
              <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded text-center">
                <span className="text-[10px] text-gray-500 block mb-0.5">Your Signature:</span>
                <img
                  src={user.signature}
                  alt="Signature"
                  className="h-12 w-auto mx-auto object-contain"
                />
              </div>
            ) : (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                Notice: You haven&apos;t drawn a signature in your profile yet. Your digital identity stamp will be used.
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
