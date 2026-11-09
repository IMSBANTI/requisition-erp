import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  resolveCostHeadsForKind,
  getDefaultProjectTermsByCode,
  extractProjectMeta,
} from "@/lib/profitEngine";
import { ensureUploadedKitProjectsSynced } from "@/lib/projectSync";
import AppShell from "@/components/AppShell";
import AdminProjectsClient from "./AdminProjectsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProjectsPage() {
  const user = await requireUser();
  await ensureUploadedKitProjectsSynced();

  const isSuperAdmin =
    user.permissions.includes("project.manage") ||
    user.permissions.includes("admin.users");

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

  const isGroupHead =
    Boolean(user.role.isManager) ||
    projects.some((p: any) => p.headId === user.id);

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Projects & Events — Workflow, Billing & Profit Setup
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Strictly separated setup for Projects (monthly recurring) and Events (campaign/activation), including Billing Profiles, Cost Heads (Billable vs IMS Investment), and approval chains.
            </p>
          </div>
          <div className="text-xs">
            {isSuperAdmin ? (
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-[#E42528] border border-red-200 font-bold">
                🔑 Admin — Full Access (All Projects)
              </span>
            ) : isGroupHead ? (
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                👤 Group Head — Edit Your Assigned Projects (Others Read-Only)
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200 font-semibold">
                👁️ Read-Only View
              </span>
            )}
          </div>
        </div>

        <AdminProjectsClient
          projects={projects.map((p: any) => {
            const isEvent = p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-");
            const fallbackTerms = getDefaultProjectTermsByCode(p.code, p.kind);
            const meta = extractProjectMeta(p.costHeads);
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
              costHeads: resolveCostHeadsForKind(p.costHeads, isEvent),
              stepThresholds: meta.stepThresholds || {},
            };
          })}
          companies={companies}
          users={users}
          currentUserId={user.id}
          isSuperAdmin={isSuperAdmin}
          canCreateProject={isSuperAdmin || isGroupHead}
          isReadOnly={!isSuperAdmin && !isGroupHead}
        />
      </div>
    </AppShell>
  );
}
