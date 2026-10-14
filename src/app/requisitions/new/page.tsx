import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import AppShell from "@/components/AppShell";
import RequisitionForm from "./RequisitionForm";

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

  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      designation: true,
      signature: true,
      pinHash: true,
    },
  });

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            New Requisition for Fund
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Fill out the digital voucher. It will be routed according to project and category rules.
          </p>
        </div>

        <RequisitionForm
          user={{
            id: user.id,
            name: fullUser?.name || user.name,
            designation: fullUser?.designation || user.designation,
            signature: fullUser?.signature || null,
            hasPin: !!fullUser?.pinHash,
          }}
          companies={companies}
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            companyId: p.companyId,
            category: p.category,
            requisitionTypes: p.requisitionTypes,
            allowOtherType: p.allowOtherType,
          }))}
        />
      </div>
    </AppShell>
  );
}
