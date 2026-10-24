import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "./constants";

export interface ScopeUser {
  id: string;
  companyId?: string | null;
  priorityLevel?: number | null;
  permissions: string[];
  departmentId: string | null;
  directorCategories?: string[];
  companyScopes: { id: string }[];
  projectScopes: { id: string }[];
}

/**
 * Prisma `where` filter restricting which requisitions a user can see:
 * - IMS GROUP Central Officers — Managing Director (MD), Accounts (Harun, Israt Jahan, Sumon),
 *   IT Super Admin (Abir Abedin), and HR (Moushumi Tamanna) — see ALL requisitions across IMS, CLAN, SCL, TradePULSE & all projects.
 * - Directors (IMS GROUP: Iftekhar, Nazmus, Shible) see requisitions across IMS, CLAN, SCL, TradePULSE & projects
 *   for their own assigned projects, departments, or employees/managers reporting to them (isolated from other Directors' exclusive projects).
 * - Managers ONLY see requisitions for their own department, their own assigned projects, or subordinates reporting to them.
 * - Executives ONLY see their own requisitions (or any requisition explicitly assigned to them).
 */
export function requisitionScope(user: ScopeUser): Prisma.RequisitionWhereInput {
  const p = user.permissions;

  // MD, Accounts, Super Admin (IT), and HR (IMS GROUP) can see all requisitions across IMS, CLAN, SCL, TradePULSE & projects
  const canSeeAll =
    p.includes(PERMISSIONS.REQ_MD) ||
    p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
    p.includes(PERMISSIONS.REQ_FORWARD) ||
    p.includes(PERMISSIONS.REQ_EXECUTE) ||
    p.includes(PERMISSIONS.ADMIN_USERS) ||
    p.includes(PERMISSIONS.ADMIN_READONLY) ||
    p.includes(PERMISSIONS.REQ_VIEW_ALL);

  if (canSeeAll) {
    return {};
  }

  // Base visibility for every user: own requisitions, currently assigned to them, or already signed by them
  const or: Prisma.RequisitionWhereInput[] = [
    { makerId: user.id },
    { currentAssigneeId: user.id },
    { executorId: user.id },
    { approvals: { some: { userId: user.id } } },
  ];

  const isApproverOrDirector =
    p.includes(PERMISSIONS.REQ_APPROVE) || p.includes(PERMISSIONS.REQ_DIRECTOR);

  if (isApproverOrDirector) {
    // 1. Requisitions where this user is the Project Head, Project Checker, or Project Director
    or.push(
      { project: { headId: user.id } },
      { project: { checkerId: user.id } },
      { project: { directorId: user.id } }
    );

    // 2. Requisitions where this user is the Department Head
    or.push({ department: { headId: user.id } });

    // 3. Requisitions raised by direct subordinates or 2nd-level subordinates (Executive -> Manager -> Director)
    or.push(
      { maker: { supervisorId: user.id } },
      { maker: { supervisor: { supervisorId: user.id } } }
    );

    // 4. Own primary department requisitions (for Department Managers / Directors)
    if (p.includes(PERMISSIONS.REQ_VIEW_DEPARTMENT) && user.departmentId) {
      or.push({ departmentId: user.departmentId });
    }

    // 5. Explicitly assigned projects for this Checker / Manager / Director
    if (user.projectScopes.length > 0) {
      or.push({ projectId: { in: user.projectScopes.map((x) => x.id) } });
    }
  }

  // IT Checker sees AI/IT category requisitions
  if (p.includes(PERMISSIONS.REQ_APPROVE_IT)) {
    or.push({ category: "AI_IT" });
  }

  return { OR: or };
}

/** Which projects may this user raise requisitions for / manage? */
export function projectScope(user: ScopeUser): Prisma.ProjectWhereInput {
  const p = user.permissions;
  // IMS GROUP officers & P4/P5 / Project Managers can select any active project or event (including newly added ones)
  if (
    (user.priorityLevel ?? 2) >= 4 ||
    p.includes(PERMISSIONS.PROJECT_MANAGE) ||
    p.includes(PERMISSIONS.PROJECT_VIEW) ||
    p.includes(PERMISSIONS.REQ_VIEW_ALL) ||
    p.includes(PERMISSIONS.ADMIN_USERS) ||
    p.includes(PERMISSIONS.ADMIN_READONLY) ||
    p.includes(PERMISSIONS.REQ_MD) ||
    p.includes(PERMISSIONS.REQ_DIRECTOR) ||
    p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
    p.includes(PERMISSIONS.REQ_FORWARD) ||
    p.includes(PERMISSIONS.REQ_EXECUTE) ||
    !user.companyId
  ) {
    return { active: true };
  }

  const or: Prisma.ProjectWhereInput[] = [
    { headId: user.id },
    { checkerId: user.id },
    { directorId: user.id },
    { createdById: user.id },
  ];

  if (user.projectScopes.length > 0) {
    or.push({ id: { in: user.projectScopes.map((x) => x.id) } });
  } else if (user.companyScopes.length > 0) {
    or.push({ companyId: { in: user.companyScopes.map((c) => c.id) } });
  } else if (user.companyId) {
    or.push({ companyId: user.companyId });
  }

  return { active: true, OR: or };
}
