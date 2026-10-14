import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import AppShell from "@/components/AppShell";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const user = await requireUser();

  const hasAccess =
    user.permissions.includes("report.view") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("admin.readonly") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("req.accounts.check") ||
    user.role.isManager;

  if (!hasAccess) {
    redirect("/?denied=1");
  }

  // Fetch companies accessible to this user
  const isSuper =
    user.permissions.includes("req.view.all") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("admin.readonly") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("req.accounts.check");

  const companies = await prisma.company.findMany({
    where: isSuper ? {} : { id: { in: user.companyScopes.map((c) => c.id) } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Fetch projects accessible to this user
  const projects = await prisma.project.findMany({
    where: projectScope(user),
    select: { id: true, name: true, category: true, budget: true, companyId: true },
    orderBy: { name: "asc" },
  });

  // Fetch departments
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Categories list
  const categories = [
    { key: "AI_IT", label: "AI / IT & Transformation" },
    { key: "OUTSOURCING", label: "Outsourcing (BPO)" },
    { key: "STUDIO", label: "Studio & Creative" },
    { key: "BUSINESS_DEV", label: "Business Development" },
    { key: "OPERATIONS", label: "Operations & Events" },
    { key: "GENERAL", label: "General & Admin" },
  ];

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
