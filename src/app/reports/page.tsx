import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessFinancialReports,
  financialReportProjectScope,
  hasFullReportAccess,
} from "@/lib/rbac";
import { CATEGORIES } from "@/lib/constants";
import AppShell from "@/components/AppShell";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const user = await requireUser();

  if (!canAccessFinancialReports(user)) {
    redirect("/?denied=1");
  }

  // Fetch projects accessible to this user under Financial Report scope
  const projects = await prisma.project.findMany({
    where: financialReportProjectScope(user),
    select: { id: true, name: true, category: true, budget: true, companyId: true },
    orderBy: { name: "asc" },
  });

  // Fetch companies accessible to this user (from their permitted projects or company scopes)
  const isFullReport = hasFullReportAccess(user);
  const allowedCompanyIds = Array.from(
    new Set([
      ...projects.map((p) => p.companyId),
      ...(isFullReport ? [] : user.companyScopes.map((c) => c.id)),
    ])
  );

  const companies = await prisma.company.findMany({
    where: isFullReport ? {} : { id: { in: allowedCompanyIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Fetch departments
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Categories list
  const categories = [...CATEGORIES];

  return (
    <AppShell>
      <ReportsClient
        currentUser={user}
        companies={companies}
        projects={projects}
        departments={departments}
        categories={categories}
      />
    </AppShell>
  );
}
