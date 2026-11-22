import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import {
  SECURITY_PERMISSIONS,
  is2FARequiredForUser,
  isExecutiveOrDirectorUser,
  isSensitiveRoleFor2FA,
} from "@/lib/security";
import { getRequestSecurityContext, getSecurityPolicy } from "@/lib/securityServer";
import SecuritySettingsClient from "./SecuritySettingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSecurityPage() {
  const user = await requireUser();
  if (!user.permissions.includes("admin.users")) {
    redirect("/?denied=1");
  }

  const [policy, reqCtx, users, securityLogs] = await Promise.all([
    getSecurityPolicy(),
    getRequestSecurityContext(false),
    prisma.user.findMany({
      where: { active: true },
      include: { role: true },
      orderBy: [{ priorityLevel: "desc" }, { name: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "LOGIN_SUCCESS",
            "LOGIN_FAILED",
            "LOGIN_BLOCKED_IP",
            "LOGIN_BLOCKED_MOBILE",
            "2FA_ENABLED",
            "2FA_DISABLED",
            "2FA_FAILED",
            "2FA_BACKUP_USED",
            "2FA_BACKUP_REGENERATED",
            "ADMIN_2FA_RESET",
            "SECURITY_POLICY_UPDATED",
          ],
        },
      },
      take: 30,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true, designation: true } },
      },
    }),
  ]);

  const userRows = users.map((u) => {
    const permissions = Array.from(
      new Set([...(u.role?.permissions || []), ...(u.extraPermissions || [])])
    );
    const secUser = {
      id: u.id,
      priorityLevel: u.priorityLevel,
      levelLabel: u.levelLabel,
      role: u.role,
      permissions,
      extraPermissions: u.extraPermissions || [],
      twoFactorEnabled: u.twoFactorEnabled,
    };
    const isSensitive = isSensitiveRoleFor2FA(secUser);
    const is2faRequired = is2FARequiredForUser(secUser, policy);
    const isExecOrDir = isExecutiveOrDirectorUser(secUser);
    const extra = u.extraPermissions || [];

    return {
      id: u.id,
      employeeId: u.employeeId || "",
      name: u.name,
      email: u.email,
      roleName: u.role?.name || "",
      levelLabel: u.levelLabel || "",
      isSensitive,
      is2faRequired,
      twoFactorEnabled: u.twoFactorEnabled,
      twoFactorEnrolledAt: u.twoFactorEnrolledAt
        ? u.twoFactorEnrolledAt.toISOString()
        : null,
      backupCodesLeft: (u.twoFactorBackupCodes || []).length,
      allowRemoteIp:
        isExecOrDir || extra.includes(SECURITY_PERMISSIONS.ALLOW_REMOTE_IP),
      allowMobile:
        isExecOrDir || extra.includes(SECURITY_PERMISSIONS.ALLOW_MOBILE),
      isExecOrDir,
    };
  });

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Security Controls, Office IP Lock &amp; Two-Factor Authentication
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Protect sensitive financial &amp; approval data with Office IP Allowlisting, Mobile Access Lock, and mandatory Authenticator 2FA for MD, Directors, Accounts &amp; Super Admin.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-xs font-bold">
            Super Admin Control
          </span>
        </div>

        <SecuritySettingsClient
          initialPolicy={policy}
          detectedIp={reqCtx.ip || "local"}
          deviceSummary={reqCtx.deviceSummary}
          users={userRows}
          recentLogs={securityLogs.map((l) => ({
            id: l.id,
            action: l.action,
            details: l.details || "",
            ip: l.ip || "local",
            createdAt: l.createdAt.toISOString(),
            userName: l.user?.name || "System",
            userEmail: l.user?.email || "",
          }))}
        />
      </div>
    </AppShell>
  );
}
