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
        companyScopes: true,
        projectScopes: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              User Management & Privileges
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage accounts, assign roles, company/project scopes, and reset passwords.
              {isReadOnly && (
                <span className="ml-2 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Read-Only Mode (HR)
                </span>
              )}
            </p>
          </div>
        </div>

        <AdminUsersClient
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            designation: u.designation,
            roleId: u.roleId,
            roleName: u.role.name,
            companyName: u.company?.name || "All / Group",
            departmentName: u.department?.name || "—",
            active: u.active,
            hasSignature: !!u.signature,
            hasPin: !!u.pinHash,
          }))}
          roles={roles}
          companies={companies}
          departments={departments}
          projects={projects}
          isReadOnly={isReadOnly}
        />
      </div>
    </AppShell>
  );
}
