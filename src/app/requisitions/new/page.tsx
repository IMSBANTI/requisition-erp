import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/rbac";
import AppShell from "@/components/AppShell";
import RequisitionForm from "./RequisitionForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRequisitionPage() {
  const user = await requireUser();

  // Ensure default Operations & Event projects exist if DB was bootstrapped before they were added
  const eventCount = await prisma.project.count({
    where: { OR: [{ kind: "EVENT" }, { category: "OPERATIONS_EVENT" }] },
  });
  if (eventCount <= 1) {
    const imsCo = await prisma.company.findFirst({ where: { code: "IMS" } });
    if (imsCo) {
      const [ringku, pavel, kauser, shible, deletedLogs] = await Promise.all([
        prisma.user.findFirst({ where: { employeeId: "1092" }, select: { id: true } }),
        prisma.user.findFirst({ where: { employeeId: "1093" }, select: { id: true } }),
        prisma.user.findFirst({ where: { employeeId: "1097" }, select: { id: true } }),
        prisma.user.findFirst({ where: { employeeId: "1026" }, select: { id: true } }),
        prisma.auditLog.findMany({
          where: { action: { in: ["PROJECT_DELETED", "PROJECT_ARCHIVED"] } },
          select: { details: true },
        }),
      ]);
      const deletedCodes = new Set(
        deletedLogs
          .map((l) => l.details?.match(/\(([^()]+)\)\s+(?:deleted|archived)/i)?.[1]?.toUpperCase())
          .filter(Boolean)
      );
      const defaultOpsEvents = [
        {
          code: "PROJ-BHN",
          name: "BeHereNow (BHN)",
          kind: "PERMANENT",
          category: "OPERATIONS_EVENT",
          headId: ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "ADMIN", "CASH"],
        },
        {
          code: "EVT-BL",
          name: "Event — Banglalink",
          kind: "EVENT",
          category: "OPERATIONS_EVENT",
          headId: ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "CASH"],
        },
        {
          code: "EVT-GP",
          name: "Event — GP (GP Project Events)",
          kind: "EVENT",
          category: "OPERATIONS_EVENT",
          headId: ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "CASH"],
        },
        {
          code: "EVT-BKASH",
          name: "Event — Bkash",
          kind: "EVENT",
          category: "OPERATIONS_EVENT",
          headId: pavel?.id || ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "CASH"],
        },
        {
          code: "EVT-BAT",
          name: "Event — BAT (BAT Project Events)",
          kind: "EVENT",
          category: "OPERATIONS_EVENT",
          headId: kauser?.id || ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "CASH"],
        },
        {
          code: "EVT-GEN",
          name: "Events — General & Activations",
          kind: "EVENT",
          category: "OPERATIONS_EVENT",
          headId: ringku?.id || null,
          directorId: shible?.id || null,
          requisitionTypes: ["EVENT", "BPO", "CASH"],
        },
      ];
      for (const ep of defaultOpsEvents) {
        if (deletedCodes.has(ep.code)) continue;
        const exists = await prisma.project.findUnique({ where: { code: ep.code } });
        if (!exists) {
          await prisma.project.create({
            data: {
              ...ep,
              companyId: imsCo.id,
              mdApprovalMode: "INSTANT",
            },
          });
        }
      }
    }
  }

  // Find user's available projects and companies
  const projects = await prisma.project.findMany({
    where: projectScope(user),
    include: {
      company: true,
    },
    orderBy: { name: "asc" },
  });

  const isGroupOrHighLevel =
    (user.priorityLevel ?? 2) >= 4 ||
    !user.companyId ||
    user.permissions.includes("req.view.all") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.accounts.check");

  const allowedCompanyIds = isGroupOrHighLevel
    ? undefined
    : Array.from(
        new Set([
          ...(user.companyId ? [user.companyId] : []),
          ...(user.companyScopes?.map((c) => c.id) || []),
          ...projects.map((p) => p.companyId),
        ])
      );

  const [companies, departments, fullUser] = await Promise.all([
    prisma.company.findMany({
      where: {
        active: true,
        ...(allowedCompanyIds && allowedCompanyIds.length > 0
          ? { id: { in: allowedCompanyIds } }
          : {}),
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where:
        !isGroupOrHighLevel && !user.role.isManager && user.departmentId
          ? { id: user.departmentId }
          : undefined,
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
        priorityLevel: true,
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
            Fill out the digital requisition voucher below.
          </p>
        </div>

        <RequisitionForm
          user={{
            id: user.id,
            name: fullUser?.name || user.name,
            designation: fullUser?.designation || user.designation,
            signature: fullUser?.signature || null,
            hasPin: !!fullUser?.pinHash,
            priorityLevel: fullUser?.priorityLevel ?? user.priorityLevel ?? 2,
            isManager: Boolean(user.role.isManager),
            companyId: fullUser?.companyId || user.companyId || null,
            departmentId: fullUser?.departmentId || user.departmentId || null,
            departmentName: fullUser?.department?.name || user.department?.name || "",
            secondaryDepartments: fullUser?.secondaryDepartments || [],
            permissions: user.permissions || [],
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
