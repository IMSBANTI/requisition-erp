import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import AppShell from "@/components/AppShell";
import RequisitionForm from "./RequisitionForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRequisitionPage() {
  const user = await requireUser();

  // Find user's available projects and companies
  const projects = await prisma.project.findMany({
    where: projectScope(user),
    include: {
      company: true,
    },
    orderBy: { name: "asc" },
  });

  const [companies, departments, fullUser] = await Promise.all([
    prisma.company.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        designation: true,
        signature: true,
        pinHash: true,
        companyId: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        secondaryDepartments: true,
      },
    }),
  ]);

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            New Requisition for Fund
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Raise an IMS Group Company requisition (permanent employee / department) or a Project-based requisition (IMS Outsourcing, TradePULSE, IMS Operations & Events).
          </p>
        </div>

        <RequisitionForm
          user={{
            id: user.id,
            name: fullUser?.name || user.name,
            designation: fullUser?.designation || user.designation,
            signature: fullUser?.signature || null,
            hasPin: !!fullUser?.pinHash,
            companyId: fullUser?.companyId || user.companyId || null,
            departmentId: fullUser?.departmentId || user.departmentId || null,
            departmentName: fullUser?.department?.name || user.department?.name || "",
            secondaryDepartments: fullUser?.secondaryDepartments || [],
          }}
          companies={companies}
          departments={departments}
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            kind: p.kind,
            companyId: p.companyId,
            companyCode: p.company.code,
            companyName: p.company.name,
            category: p.category,
            requisitionTypes: p.requisitionTypes,
            allowOtherType: p.allowOtherType,
          }))}
        />
      </div>
    </AppShell>
  );
}
