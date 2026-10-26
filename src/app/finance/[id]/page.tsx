import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import {
  calculateProfitSummary,
  getDefaultProjectTermsByCode,
} from "@/lib/profitEngine";
import AppShell from "@/components/AppShell";
import ProjectFinanceDetailClient from "./ProjectFinanceDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectFinanceDetailPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

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

  const p: any = await prisma.project.findFirst({
    where: {
      AND: [{ id }, projectScope(user)],
    },
    include: {
      company: true,
      head: true,
      checker: true,
      director: true,
      requisitions: {
        where: {
          status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] },
        },
        include: {
          items: { orderBy: { sl: "asc" } },
          maker: { select: { id: true, name: true, designation: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      clientBills: {
        orderBy: { createdAt: "desc" },
      },
    } as any,
  });

  if (!p) {
    notFound();
  }

  const isEvent = p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-");
  const fallbackTerms = getDefaultProjectTermsByCode(p.code, p.kind);

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

  // Format all requisitions with their individual Billable & IMS Investment costs
  const requisitions = (p.requisitions || []).map((r: any) => {
    let billable = 0;
    let imsInv = 0;
    const items = (r.items || []).map((it: any) => {
      const amt = Number(it.amount || 0);
      if (it.costTag === "IMS_INVESTMENT") {
        imsInv += amt;
      } else {
        billable += amt;
      }
      return {
        id: it.id,
        sl: it.sl,
        costHead: it.costHead || it.particulars,
        costTag: it.costTag || "BILLABLE",
        forMonth: it.forMonth || r.forMonth || null,
        particulars: it.particulars,
        purpose: it.purpose || "",
        qty: Number(it.qty || 1),
        unitPrice: Number(it.unitPrice || 0),
        amount: amt,
      };
    });

    const mKey =
      r.forMonth || new Date(r.date || r.createdAt).toISOString().slice(0, 7);

    return {
      id: r.id,
      number: r.number || "Voucher",
      forMonth: mKey,
      date: new Date(r.date || r.createdAt).toISOString().slice(0, 10),
      makerName: r.makerName,
      makerDesignation: r.makerDesignation,
      status: r.status,
      type: r.type,
      billableCost: billable,
      imsInvestment: imsInv,
      total: Number(r.total || 0),
      changeReason: r.changeReason || "",
      comments: r.comments || "",
      items,
    };
  });

  // Format all partial/full payment & bill records
  const payments = (p.clientBills || []).map((b: any) => ({
    id: b.id,
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

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <ProjectFinanceDetailClient
          project={{
            id: p.id,
            code: p.code,
            name: p.name,
            companyName: p.company.name,
            kind: isEvent ? "EVENT" : "PERMANENT",
            category: p.category,
            headName: p.head?.name || "—",
            checkerName: p.checker?.name || "—",
            directorName: p.director?.name || "—",
            budget: p.budget ? Number(p.budget) : 0,
            terms,
          }}
          requisitions={requisitions}
          payments={payments}
          canEditFinance={canEditFinance}
        />
      </div>
    </AppShell>
  );
}
