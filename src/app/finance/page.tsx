import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessFinancialReports,
  financialReportProjectScope,
  hasFullReportAccess,
} from "@/lib/rbac";
import {
  extractProjectMeta,
  resolveCostHeadsForKind,
} from "@/lib/profitEngine";
import {
  OPENING_BILL_PREFIX,
  computeProjectPeriodMetrics,
  getEffectiveDisbursedAmount,
  isApprovedSpendStatus,
  resolveEffectiveProjectTerms,
} from "@/lib/financeMetrics";
import { ensureUploadedKitProjectsSynced } from "@/lib/projectSync";
import AppShell from "@/components/AppShell";
import FinanceClient from "./FinanceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function FinancePnlPage() {
  const user = await requireUser();
  await ensureUploadedKitProjectsSynced();

  if (!canAccessFinancialReports(user)) {
    redirect("/?denied=1");
  }

  const canEditFinance =
    user.permissions.includes("req.accounts.check") ||
    user.permissions.includes("req.execute") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("project.manage") ||
    Boolean(user.role.isManager);

  const projects = await prisma.project.findMany({
    where: financialReportProjectScope(user),
    include: {
      company: true,
      head: true,
      checker: true,
      director: true,
      requisitions: {
        where: {
          status: { notIn: ["DRAFT", "REJECTED", "CANCELLED", "RETURNED"] },
        },
        include: {
          items: true,
          approvals: {
            where: { step: "EXECUTION" },
            select: { action: true, comment: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      clientBills: {
        orderBy: { createdAt: "desc" },
      },
    } as any,
    orderBy: { name: "asc" },
  });

  const formattedProjects = projects.map((p: any) => {
    const isCompanyDivision =
      COMPANY_DIVISION_CODES.has(p.code) ||
      p.code?.endsWith("-CORP") ||
      p.name?.toLowerCase() === "tradepulse";
    const isEvent =
      !isCompanyDivision &&
      (p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-"));
    const entityKind = isCompanyDivision
      ? "COMPANY"
      : isEvent
      ? "EVENT"
      : "PERMANENT";

    const meta = extractProjectMeta(p.costHeads);
    const configuredCostHeads = resolveCostHeadsForKind(p.costHeads, isEvent, p.code);
    const closedMonths = meta.closedMonths || {};
    const manualForecasts = meta.manualForecasts || {};
    const terms = resolveEffectiveProjectTerms(p);

    // Aggregate requisition costs (Approved / Executed only) grouped by service month
    let totalBillableReq = 0;
    let totalImsInvReq = 0;
    let executedBillable = 0;
    let executedImsInv = 0;

    const byMonth: Record<
      string,
      {
        forMonth: string;
        billableCost: number;
        imsInvestment: number;
        executedBillable: number;
        executedImsInv: number;
        reqCount: number;
        approvedReqCount: number;
      }
    > = {};

    const requisitionsList = (p.requisitions || []).map((r: any) => {
      const mKey =
        r.forMonth ||
        new Date(r.date || r.createdAt).toISOString().slice(0, 7);

      if (!byMonth[mKey]) {
        byMonth[mKey] = {
          forMonth: mKey,
          billableCost: 0,
          imsInvestment: 0,
          executedBillable: 0,
          executedImsInv: 0,
          reqCount: 0,
          approvedReqCount: 0,
        };
      }
      byMonth[mKey].reqCount += 1;

      let reqBillable = 0;
      let reqIms = 0;
      if (Array.isArray(r.items) && r.items.length > 0) {
        for (const it of r.items) {
          const amt = Number(it.amount || 0);
          if (it.costTag === "IMS_INVESTMENT") {
            reqIms += amt;
          } else {
            reqBillable += amt;
          }
        }
      } else {
        reqBillable = Number(r.billableTotal || r.total || 0);
        reqIms = Number(r.imsInvestmentTotal || 0);
      }

      const disbursedAmount = getEffectiveDisbursedAmount(r);
      const isApproved = isApprovedSpendStatus(r.status);

      if (isApproved) {
        totalBillableReq += reqBillable;
        totalImsInvReq += reqIms;
        byMonth[mKey].billableCost += reqBillable;
        byMonth[mKey].imsInvestment += reqIms;
        byMonth[mKey].approvedReqCount += 1;

        if (disbursedAmount > 0) {
          const reqSum = reqBillable + reqIms;
          const ratio = reqSum > 0 ? Math.min(1, disbursedAmount / reqSum) : 1;
          const dBill = reqBillable * ratio;
          const dIms = reqIms * ratio;
          executedBillable += dBill;
          executedImsInv += dIms;
          byMonth[mKey].executedBillable += dBill;
          byMonth[mKey].executedImsInv += dIms;
        }
      }

      return {
        id: r.id,
        number: r.number || "Voucher",
        forMonth: mKey,
        date: new Date(r.date || r.createdAt).toISOString().slice(0, 10),
        disburseOn: r.disburseOn ? new Date(r.disburseOn).toISOString().slice(0, 10) : "",
        approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString().slice(0, 10) : "",
        executedAt: r.executedAt ? new Date(r.executedAt).toISOString().slice(0, 10) : "",
        makerName: r.makerName,
        status: r.status,
        currency: r.currency || "BDT",
        billableCost: reqBillable,
        imsInvestment: reqIms,
        total: Number(r.total || 0),
        disbursedAmount,
        variancePct:
          r.variancePct !== null && r.variancePct !== undefined
            ? Number(r.variancePct)
            : null,
        changeReason: r.changeReason || "",
        remarks: r.comments || r.remarks || "",
        items: (r.items || []).map((it: any) => ({
          id: it.id,
          sl: it.sl,
          particulars: it.particulars,
          costHead: it.costHead || "Uncategorized",
          costTag: it.costTag || "BILLABLE",
          forMonth: it.forMonth || mKey,
          lastMonthAmount:
            it.lastMonthAmount !== null && it.lastMonthAmount !== undefined
              ? Number(it.lastMonthAmount)
              : 0,
          amount: Number(it.amount || 0),
        })),
      };
    });

    const bills = (p.clientBills || []).map((b: any) => {
      const rawNotes = b.notes || "";
      const isOpeningBalance = rawNotes.startsWith(OPENING_BILL_PREFIX);
      const cleanNotes = rawNotes.replace(OPENING_BILL_PREFIX, "").trim();
      return {
        id: b.id,
        projectId: b.projectId,
        projectName: p.name,
        projectCode: p.code,
        kind: entityKind,
        forMonth: b.forMonth,
        billNumber: b.billNumber || "",
        poNumber: b.poNumber || "",
        status: b.status,
        billableCost: Number(b.billableCost || 0),
        imsInvestment: Number(b.imsInvestment || 0),
        billExVat: Number(b.billExVat || 0),
        vatAmount: Number(b.vatAmount || 0),
        billWithVat: Number(b.billWithVat || 0),
        aitAmount: Number(b.aitAmount || 0),
        expectedInflow: Number(b.expectedInflow || 0),
        receivedAmount: Number(b.receivedAmount || 0),
        accruedNetProfit: isOpeningBalance ? 0 : Number(b.accruedNetProfit || 0),
        realizedNetProfit: isOpeningBalance ? 0 : Number(b.realizedNetProfit || 0),
        poReceivedAt: b.poReceivedAt ? new Date(b.poReceivedAt).toISOString().slice(0, 10) : "",
        grReceivedAt: b.grReceivedAt ? new Date(b.grReceivedAt).toISOString().slice(0, 10) : "",
        submittedAt: b.submittedAt ? new Date(b.submittedAt).toISOString().slice(0, 10) : "",
        dueDate: b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : "",
        receivedAt: b.receivedAt ? new Date(b.receivedAt).toISOString().slice(0, 10) : "",
        deviationReason: b.deviationReason || "",
        notes: cleanNotes,
        isOpeningBalance,
      };
    });

    const overallMetrics = computeProjectPeriodMetrics({
      terms,
      requisitions: requisitionsList,
      bills,
      selectedMonth: "ALL",
    });

    const overallCalc = {
      ...overallMetrics.calc,
      billExVat: overallMetrics.billedExVat,
      billWithVat: overallMetrics.billedWithVat,
      aitDeducted: overallMetrics.aitDeducted,
      expectedInflow: overallMetrics.expectedInflow,
      netProfit: overallMetrics.accruedProfit,
      netMarginPct: overallMetrics.netMarginPct,
    };

    const totalReceivedFromBills = bills
      .filter((b: any) => !b.isOpeningBalance)
      .reduce((sum: number, b: any) => sum + b.receivedAmount, 0);
    const totalExpectedFromBills = bills
      .filter((b: any) => !b.isOpeningBalance)
      .reduce((sum: number, b: any) => sum + b.expectedInflow, 0);
    const totalBilledWithVat = bills
      .filter((b: any) => !b.isOpeningBalance)
      .reduce((sum: number, b: any) => sum + b.billWithVat, 0);

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      companyName: p.company.name,
      kind: entityKind,
      headName: p.head?.name || "—",
      checkerName: p.checker?.name || "—",
      directorName: p.director?.name || "—",
      budget: p.budget ? Number(p.budget) : 0,
      terms,
      reqCount: requisitionsList.length,
      requisitionsList,
      totalBillableReq,
      totalImsInvReq,
      executedBillable,
      executedImsInv,
      overallCalc,
      monthlyBreakdown: Object.values(byMonth).sort((a, b) =>
        b.forMonth.localeCompare(a.forMonth)
      ),
      bills,
      totalReceivedFromBills,
      totalExpectedFromBills,
      totalBilledWithVat,
      costHeads: configuredCostHeads,
      closedMonths,
      manualForecasts,
    };
  });

  const canCloseMonth =
    user.permissions.includes("req.accounts.check") ||
    user.permissions.includes("req.execute") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("project.manage");

  const isFullReportAccess = hasFullReportAccess(user);

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Projects, Events &amp; IMS Group Expenses — P&amp;L &amp; Client Collections
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isFullReportAccess
                ? "Full unrestricted view across all Client Projects, Events, and IMS Group Internal Overhead Expenses."
                : "Restricted view: showing financial reports only for the specific Projects, Events, or IMS Group Divisions assigned to you."}
            </p>
          </div>
          <div className="text-xs">
            {isFullReportAccess ? (
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-[#E42528] border border-red-200 font-bold">
                🌐 Full Financial Report Access ({formattedProjects.length})
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                🔒 Assigned Scope Only ({formattedProjects.length} Item{formattedProjects.length === 1 ? "" : "s"})
              </span>
            )}
          </div>
        </div>

        <FinanceClient
          projects={formattedProjects}
          canEditFinance={canEditFinance}
          canCloseMonth={canCloseMonth}
          isFullReportAccess={isFullReportAccess}
        />
      </div>
    </AppShell>
  );
}
