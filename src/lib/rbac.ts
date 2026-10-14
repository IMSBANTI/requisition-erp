import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "./constants";

export interface ScopeUser {
  id: string;
  permissions: string[];
  departmentId: string | null;
  companyScopes: { id: string }[];
  projectScopes: { id: string }[];
}

/**
 * Prisma `where` filter restricting which requisitions a user can see.
 * Everyone sees their own; approvers also see anything they are assigned to or have signed.
 */
export function requisitionScope(user: ScopeUser): Prisma.RequisitionWhereInput {
  const p = user.permissions;
  if (p.includes(PERMISSIONS.REQ_VIEW_ALL) || p.includes(PERMISSIONS.ADMIN_READONLY) || p.includes(PERMISSIONS.ADMIN_USERS)) {
    return {};
  }
  const or: Prisma.RequisitionWhereInput[] = [
    { makerId: user.id },
    { currentAssigneeId: user.id },
    { executorId: user.id },
    { approvals: { some: { userId: user.id } } },
  ];
  if (p.includes(PERMISSIONS.REQ_VIEW_COMPANY) && user.companyScopes.length)
    or.push({ companyId: { in: user.companyScopes.map((c) => c.id) } });
  if (p.includes(PERMISSIONS.REQ_VIEW_PROJECT) && user.projectScopes.length)
    or.push({ projectId: { in: user.projectScopes.map((x) => x.id) } });
  if (p.includes(PERMISSIONS.REQ_VIEW_DEPARTMENT) && user.departmentId) or.push({ departmentId: user.departmentId });
  // Pool steps: any holder of the permission can act on them
  if (p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK)) or.push({ status: "PENDING_ACCOUNTS" });
  if (p.includes(PERMISSIONS.REQ_MD)) or.push({ status: "PENDING_MD" }, { mdStatus: "PENDING_BATCH" });
  if (p.includes(PERMISSIONS.REQ_FORWARD)) or.push({ status: { in: ["APPROVED", "FORWARDED", "EXECUTED"] } });
  return { OR: or };
}

/** Which projects may this user raise requisitions for / manage? */
export function projectScope(user: ScopeUser): Prisma.ProjectWhereInput {
  const p = user.permissions;
  if (p.includes(PERMISSIONS.REQ_VIEW_ALL) || p.includes(PERMISSIONS.ADMIN_USERS)) return { active: true };
  const or: Prisma.ProjectWhereInput[] = [];
  if (user.projectScopes.length) or.push({ id: { in: user.projectScopes.map((x) => x.id) } });
  if (p.includes(PERMISSIONS.REQ_VIEW_COMPANY) && user.companyScopes.length)
    or.push({ companyId: { in: user.companyScopes.map((c) => c.id) } });
  if (!or.length) return { id: "__none__" };
  return { active: true, OR: or };
}
