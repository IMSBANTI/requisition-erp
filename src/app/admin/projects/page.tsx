import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  DEFAULT_PROJECT_COST_HEADS,
  DEFAULT_EVENT_COST_HEADS,
  getDefaultProjectTermsByCode,
} from "@/lib/profitEngine";
import AppShell from "@/components/AppShell";
import AdminProjectsClient from "./AdminProjectsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProjectsPage() {
  const user = await requireUser();

  const canEditProjects = user.permissions.includes("project.manage");
  const canViewProjects = canEditProjects || user.permissions.includes("project.view");

  if (!canViewProjects) {
    redirect("/?denied=1");
  }

  const [projects, companies, users] = await Promise.all([
    prisma.project.findMany({
      include: {
        company: true,
        head: true,
        checker: true,
        director: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, designation: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Projects & Events — Workflow, Billing & Profit Setup
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Strictly separated setup for Projects (monthly recurring) and Events (campaign/activation), including Billing Profiles, Cost Heads (Billable vs IMS Investment), and approval chains.
          </p>
        </div>

        <AdminProjectsClient
          projects={projects.map((p: any) => {
            const isEvent = p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-");
            const fallbackTerms = getDefaultProjectTermsByCode(p.code, p.kind);
            return {
              id: p.id,
              code: p.code,
              name: p.name,
              companyName: p.company.name,
              companyId: p.companyId,
              kind: isEvent ? "EVENT" : "PERMANENT",
              category: p.category,
              mdApprovalMode: p.mdApprovalMode,
              releaseBeforeMd: p.releaseBeforeMd,
              requisitionTypes: p.requisitionTypes,
              headName: p.head?.name || "None",
              headId: p.headId,
              checkerName: p.checker?.name || "None",
              checkerId: p.checkerId,
              directorName: p.director?.name || "Auto (Category Director)",
              directorId: p.directorId,
              active: p.active,
              budget: p.budget ? Number(p.budget) : 0,
              billingProfile: p.billingProfile || fallbackTerms.billingProfile,
              feeRate: p.feeRate !== undefined && p.feeRate !== null ? Number(p.feeRate) : Number(fallbackTerms.feeRate),
              aitRate: p.aitRate !== undefined && p.aitRate !== null ? Number(p.aitRate) : Number(fallbackTerms.aitRate),
              vatRate: p.vatRate !== undefined && p.vatRate !== null ? Number(p.vatRate) : Number(fallbackTerms.vatRate ?? 0.15),
              billCycleDays: p.billCycleDays ?? fallbackTerms.billCycleDays ?? 30,
              funding: p.funding || fallbackTerms.funding || "POSTPAID",
              salaryMonthLag: p.salaryMonthLag ?? fallbackTerms.salaryMonthLag ?? (isEvent ? 0 : 1),
              fixedMonthlyBill: p.fixedMonthlyBill ? Number(p.fixedMonthlyBill) : fallbackTerms.fixedMonthlyBill ? Number(fallbackTerms.fixedMonthlyBill) : 0,
              maintenanceBudget: p.maintenanceBudget ? Number(p.maintenanceBudget) : Number(fallbackTerms.maintenanceBudget ?? 0),
              monthlyAmortization: p.monthlyAmortization ? Number(p.monthlyAmortization) : Number(fallbackTerms.monthlyAmortization ?? 0),
              varianceThresholdPct: p.varianceThresholdPct ? Number(p.varianceThresholdPct) : 10,
              costHeads: Array.isArray(p.costHeads) && p.costHeads.length > 0
                ? p.costHeads
                : isEvent
                ? DEFAULT_EVENT_COST_HEADS
                : DEFAULT_PROJECT_COST_HEADS,
            };
          })}
          companies={companies}
          users={users}
          isReadOnly={!canEditProjects}
        />
      </div>
    </AppShell>
  );
}
