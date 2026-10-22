import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const user = await requireUser();

  const isFullAdmin = user.permissions.includes("admin.users");
  const isReadOnly = user.permissions.includes("admin.readonly");

  if (!isFullAdmin && !isReadOnly) {
    redirect("/?denied=1");
  }

  const [users, roles, companies, departments, projects] = await Promise.all([
    prisma.user.findMany({
      include: {
        role: true,
        company: true,
        department: true,
        supervisor: { select: { id: true, name: true, employeeId: true, designation: true } },
        companyScopes: { select: { id: true, code: true, name: true } },
        projectScopes: { select: { id: true, code: true, name: true, kind: true } },
      },
      orderBy: [{ priorityLevel: "desc" }, { employeeId: "asc" }, { name: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      include: {
        company: { select: { id: true, code: true, name: true } },
        head: { select: { id: true, name: true } },
        director: { select: { id: true, name: true } },
        members: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <AdminUsersClient
          users={users.map((u) => ({
            id: u.id,
            employeeId: u.employeeId || "",
            name: u.name,
            email: u.email,
            designation: u.designation,
            priorityLevel: u.priorityLevel ?? 2,
            levelLabel: u.levelLabel || (u.role.isManager ? "Manager" : "Executive"),
            secondaryDepartments: u.secondaryDepartments || [],
            approvalNotes: u.approvalNotes || "",
            supervisorId: u.supervisorId || "",
            supervisorName: u.supervisor
              ? `${u.supervisor.name}${u.supervisor.employeeId ? ` (${u.supervisor.employeeId})` : ""}`
              : "",
            roleId: u.roleId,
            roleKey: u.role.key,
            roleName: u.role.name,
            rolePermissions: u.role.permissions,
            companyId: u.companyId || "",
            companyCode: u.company?.code || "IMS GROUP",
            companyName: u.company?.name || "IMS GROUP",
            departmentId: u.departmentId || "",
            departmentName: u.department?.name || "—",
            companyScopeIds: u.companyScopes.map((c) => c.id),
            companyScopeCodes: u.companyScopes.map((c) => c.code),
            projectScopeIds: u.projectScopes.map((p) => p.id),
            projectScopeNames: u.projectScopes.map((p) => p.name),
            directorCategories: u.directorCategories || [],
            extraPermissions: u.extraPermissions || [],
            active: u.active,
            hasSignature: !!u.signature,
            hasPin: !!u.pinHash,
          }))}
          roles={roles}
          companies={companies}
          departments={departments}
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            companyId: p.companyId,
            companyCode: p.company.code,
            companyName: p.company.name,
            kind: p.kind,
            category: p.category,
            mdApprovalMode: p.mdApprovalMode,
            headId: p.headId || "",
            headName: p.head?.name || "",
            checkerId: p.checkerId || "",
            directorId: p.directorId || "",
            directorName: p.director?.name || "",
            memberIds: p.members.map((m) => m.id),
            active: p.active,
          }))}
          isReadOnly={isReadOnly && !isFullAdmin}
        />
      </div>
    </AppShell>
  );
}
