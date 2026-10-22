import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
            Projects & Workflow Configuration
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage projects, approval chains, MD instant/batch modes, and allowed requisition tags.
          </p>
        </div>

        <AdminProjectsClient
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            companyName: p.company.name,
            companyId: p.companyId,
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
          }))}
          companies={companies}
          users={users}
          isReadOnly={!canEditProjects}
        />
      </div>
    </AppShell>
  );
}
