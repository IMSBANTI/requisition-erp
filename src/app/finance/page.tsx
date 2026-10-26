import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import {
  calculateProfitSummary,
  getDefaultProjectTermsByCode,
} from "@/lib/profitEngine";
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

  const canViewFinance =
    user.permissions.includes("req.accounts.check") ||
    user.permissions.includes("req.execute") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("admin.readonly") ||
    user.permissions.includes("report.view") ||
    user.permissions.includes("project.manage") ||
    Boolean(user.role.isManager);

  if (!canViewFinance) {
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
    where: projectScope(user),
    include: {
      company: true,
      head: true,
      director: true,
      requisitions: {
        where: {
          status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] },
        },
        include: {
          items: true,
        },
        orderBy: { createdAt: "desc" },
      },
      clientBills: {
        orderBy: { createdAt: "desc" },
      },
    } as any,
    orderBy: { name: "asc" },
  });

  // Filter out internal company division buckets so only real Projects & Events appear
  const projectAndEventList = projects.filter(
    (p) =>
      !COMPANY_DIVISION_CODES.has(p.code) &&
      !p.code.endsWith("-CORP") &&
      p.name.toLowerCase() !== "tradepulse"
  );

  const formattedProjects = projectAndEventList.map((p: any) => {
    const isEvent = p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-");
    const fallbackTerms = getDefaultProjectTermsByCode(p.code, p.kind);

    // Aggregate requisition costs (All Active/Approved vs Disbursed/Executed)
    let totalBillableReq = 0;
    let totalImsInvReq = 0;
    let executedBillable = 0;
    let executedImsInv = 0;

    // Also group by service month (YYYY-MM) for monthly P&L view
    const byMonth: Record<
      string,
      {
        forMonth: string;
        billableCost: number;
        imsInvestment: number;
        executedBillable: number;
        executedImsInv: number;
        reqCount: number;
      }
    > = {};

    for (const r of p.requisitions || []) {
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

      totalBillableReq += reqBillable;
      totalImsInvReq += reqIms;
      byMonth[mKey].billableCost += reqBillable;
      byMonth[mKey].imsInvestment += reqIms;

      if (r.status === "EXECUTED" || r.status === "APPROVED" || r.status === "FORWARDED") {
        executedBillable += reqBillable;
        executedImsInv += reqIms;
        byMonth[mKey].executedBillable += reqBillable;
        byMonth[mKey].executedImsInv += reqIms;
      }
    }

    const effectiveFixedBill =
      p.fixedMonthlyBill && Number(p.fixedMonthlyBill) > 0
        ? Number(p.fixedMonthlyBill)
        : (p.billingProfile || fallbackTerms.billingProfile) === "FIXED_QUOTE" && p.budget
        ? Number(p.budget)
        : Number(fallbackTerms.fixedMonthlyBill || 0);

    const terms = {
      billingProfile: p.billingProfile || fallbackTerms.billingProfile,
      feeRate:
        p.feeRate !== undefined && p.feeRate !== null
          ? Number(p.feeRate)
          : Number(fallbackTerms.feeRate),
      aitRate:
        p.aitRate !== undefined && p.aitRate !== null
          ? Number(p.aitRate)
          : Number(fallbackTerms.aitRate),
      vatRate:
        p.vatRate !== undefined && p.vatRate !== null
          ? Number(p.vatRate)
          : Number(fallbackTerms.vatRate ?? 0.15),
      billCycleDays: p.billCycleDays ?? fallbackTerms.billCycleDays ?? 30,
      funding: p.funding || fallbackTerms.funding || "POSTPAID",
      fixedMonthlyBill: effectiveFixedBill,
      maintenanceBudget: p.maintenanceBudget ? Number(p.maintenanceBudget) : 0,
      monthlyAmortization: p.monthlyAmortization ? Number(p.monthlyAmortization) : 0,
    };

    const overallCalc = calculateProfitSummary({
      terms,
      billableCost: totalBillableReq,
      imsInvestment: totalImsInvReq,
    });

    const bills = (p.clientBills || []).map((b: any) => ({
      id: b.id,
      projectId: b.projectId,
      projectName: p.name,
      projectCode: p.code,
      kind: isEvent ? "EVENT" : "PERMANENT",
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
      accruedNetProfit: Number(b.accruedNetProfit || 0),
      realizedNetProfit: Number(b.realizedNetProfit || 0),
      submittedAt: b.submittedAt ? new Date(b.submittedAt).toISOString().slice(0, 10) : "",
      dueDate: b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : "",
      receivedAt: b.receivedAt ? new Date(b.receivedAt).toISOString().slice(0, 10) : "",
      deviationReason: b.deviationReason || "",
      notes: b.notes || "",
    }));

    const totalReceivedFromBills = bills.reduce(
      (sum: number, b: any) => sum + b.receivedAmount,
      0
    );
    const totalExpectedFromBills = bills.reduce(
      (sum: number, b: any) => sum + b.expectedInflow,
      0
    );
    const totalBilledWithVat = bills.reduce(
      (sum: number, b: any) => sum + b.billWithVat,
      0
    );

    const requisitionsList = (p.requisitions || []).map((r: any) => {
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
      const mKey =
        r.forMonth || new Date(r.date || r.createdAt).toISOString().slice(0, 7);
      return {
        id: r.id,
        number: r.number || "Voucher",
        forMonth: mKey,
        date: new Date(r.date || r.createdAt).toISOString().slice(0, 10),
        makerName: r.makerName,
        status: r.status,
        billableCost: reqBillable,
        imsInvestment: reqIms,
        total: Number(r.total || 0),
      };
    });

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      companyName: p.company.name,
      kind: isEvent ? "EVENT" : "PERMANENT",
      headName: p.head?.name || "—",
      directorName: p.director?.name || "—",
      budget: p.budget ? Number(p.budget) : 0,
      terms,
      reqCount: (p.requisitions || []).length,
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
    };
  });

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Project & Event Profit / Loss (P&L) & Client Collections
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Track requisition spending (Billable vs. IMS Investment), Client Bills (Ex-VAT, 15% VAT, AIT), Received Client Payments, and Accrued vs. Realized Profit or Loss for Accounts, Directors & MD.
          </p>
        </div>

        <FinanceClient
          projects={formattedProjects}
          canEditFinance={canEditFinance}
        />
      </div>
    </AppShell>
  );
}
