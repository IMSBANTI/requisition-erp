import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "./constants";

export interface ScopeUser {
  id: string;
  companyId?: string | null;
  priorityLevel?: number | null;
  permissions: string[];
  departmentId: string | null;
  department?: { name: string } | null;
  secondaryDepartments?: string[];
  directorCategories?: string[];
  companyScopes: { id: string }[];
  projectScopes: { id: string }[];
}

/**
 * Prisma `where` filter restricting which requisitions a user can see:
 * - ONLY Central Accounts (Harun, Israt Jahan, Sumon) and Super Admin (IT) — or a user explicitly
 *   granted `req.view.all` / `report.view.all` without `report.strict.scope` — see ALL requisitions.
 * - Everyone else (including Polok, Group Heads, Managers, Directors, and Managing Directors) ONLY sees:
 *   1. Their own created requisitions (`makerId: user.id`)
 *   2. Requisitions currently waiting for their signature (`currentAssigneeId: user.id`) or already signed by them
 *   3. Requisitions belonging strictly to their assigned Projects, Events, or IMS Group Divisions (`financialReportProjectScope(user)`).
 */
export function requisitionScope(user: ScopeUser): Prisma.RequisitionWhereInput {
  const p = user.permissions;

  // Only Super Admin and Central Accounts see all requisitions across the entire ERP
  const isSuperAdmin = (user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS);
  const isAccounts =
    (p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
      p.includes(PERMISSIONS.REQ_FORWARD) ||
      p.includes(PERMISSIONS.REQ_EXECUTE)) &&
    !p.includes("report.strict.scope");

  const hasExplicitViewAll =
    p.includes(PERMISSIONS.REPORT_VIEW_ALL) && !p.includes("report.strict.scope");

  if (isSuperAdmin || isAccounts || hasExplicitViewAll) {
    return {};
  }

  // Base visibility for every user: own requisitions, currently assigned to them, or already signed by them
  const or: Prisma.RequisitionWhereInput[] = [
    { makerId: user.id },
    { currentAssigneeId: user.id },
    { executorId: user.id },
    { approvals: { some: { userId: user.id } } },
  ];

  const isApproverOrDirectorOrMd =
    p.includes(PERMISSIONS.REQ_APPROVE) ||
    p.includes(PERMISSIONS.REQ_DIRECTOR) ||
    p.includes(PERMISSIONS.REQ_MD);

  if (isApproverOrDirectorOrMd || user.projectScopes.length > 0) {
    // Strictly restrict project/event/division requisitions to the user's permitted scope
    or.push({
      project: financialReportProjectScope(user),
    });
  }

  // IT Checker sees AI/IT category requisitions unless restricted by strict scope
  if (p.includes(PERMISSIONS.REQ_APPROVE_IT) && !p.includes("report.strict.scope")) {
    or.push({ category: "AI_IT" });
  }

  return { OR: or };
}

/** Which projects may this user raise requisitions for / manage? */
export function projectScope(user: ScopeUser): Prisma.ProjectWhereInput {
  const p = user.permissions;
  const isSuperAdmin = (user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS);
  const isAccounts =
    (p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
      p.includes(PERMISSIONS.REQ_FORWARD) ||
      p.includes(PERMISSIONS.REQ_EXECUTE)) &&
    !p.includes("report.strict.scope");

  if (isSuperAdmin || isAccounts || p.includes(PERMISSIONS.REPORT_VIEW_ALL)) {
    return { active: true };
  }

  // Allow user's assigned Projects/Events/Divisions PLUS internal Company Divisions so they can raise Company requisitions if permitted
  const or: Prisma.ProjectWhereInput[] = [
    financialReportProjectScope(user),
    { code: { in: COMPANY_DIVISION_CODES_LIST } },
  ];

  return { active: true, OR: or };
}

export const COMPANY_DIVISION_CODES_LIST = [
  "IMS-HO",
  "IMS-IT",
  "IMS-STUDIO",
  "IMS-BD-BLUE",
  "IMS-BD-RED",
  "CLAN-MAIN",
  "SCL-MAIN",
  "TP-OPS",
];

/**
 * Whether this user has unrestricted access to ALL Financial Reports across all Projects, Events & IMS Group.
 * By design, Managing Directors, Directors, Group Heads, and Managers are restricted to ONLY their associated
 * Projects, Events, or IMS Group Divisions unless the Super Admin explicitly grants `report.view.all`.
 */
export function hasFullReportAccess(user: ScopeUser): boolean {
  const p = user.permissions;
  if ((user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS)) {
    return true;
  }
  if (p.includes(PERMISSIONS.REPORT_VIEW_ALL)) {
    return true;
  }
  // Central Accounts have full report visibility unless Super Admin explicitly restricted their scope
  if (
    (p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) || p.includes(PERMISSIONS.REQ_EXECUTE)) &&
    !p.includes("report.strict.scope") &&
    !p.includes("report.none")
  ) {
    return true;
  }
  return false;
}

/**
 * Whether this user is allowed to open Financial Reports (/finance and /reports) at all.
 */
export function canAccessFinancialReports(user: ScopeUser & { role?: { isManager?: boolean; key?: string } }): boolean {
  const p = user.permissions;
  if ((user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS)) {
    return true;
  }
  if (p.includes("report.none")) {
    return false;
  }
  return (
    p.includes(PERMISSIONS.REPORT_VIEW) ||
    p.includes(PERMISSIONS.REPORT_VIEW_ALL) ||
    p.includes(PERMISSIONS.ADMIN_READONLY) ||
    p.includes(PERMISSIONS.REQ_DIRECTOR) ||
    p.includes(PERMISSIONS.REQ_MD) ||
    p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
    p.includes(PERMISSIONS.REQ_EXECUTE) ||
    Boolean(user.role?.isManager)
  );
}

/**
 * Strict Prisma `where` filter for Financial Reports (/finance, /finance/[id], /reports, /api/finance/bills).
 * Managing Directors, Directors, Group Heads, and Managers ONLY see the specific Projects, Events, or
 * IMS Group Divisions associated with them (or explicitly configured by the Super Admin).
 */
export function financialReportProjectScope(user: ScopeUser): Prisma.ProjectWhereInput {
  const p = user.permissions;
  const andConditions: Prisma.ProjectWhereInput[] = [{ active: true }];

  // 1. Optional Report Category restrictions configured by Super Admin (Projects vs Events vs IMS Group)
  const hasCategoryFlags =
    p.includes("report.scope.projects") ||
    p.includes("report.scope.events") ||
    p.includes("report.scope.company");

  if (hasCategoryFlags && !((user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS))) {
    const catOr: Prisma.ProjectWhereInput[] = [];
    if (p.includes("report.scope.company")) {
      catOr.push({
        OR: [
          { code: { in: COMPANY_DIVISION_CODES_LIST } },
          { code: { endsWith: "-CORP" } },
        ],
      });
    }
    if (p.includes("report.scope.events")) {
      catOr.push({
        AND: [
          { code: { notIn: COMPANY_DIVISION_CODES_LIST } },
          { OR: [{ kind: "EVENT" }, { code: { startsWith: "EVT-" } }] },
        ],
      });
    }
    if (p.includes("report.scope.projects")) {
      catOr.push({
        AND: [
          { code: { notIn: COMPANY_DIVISION_CODES_LIST } },
          { NOT: { code: { endsWith: "-CORP" } } },
          { NOT: { kind: "EVENT" } },
          { NOT: { code: { startsWith: "EVT-" } } },
        ],
      });
    }
    if (catOr.length > 0) {
      andConditions.push({ OR: catOr });
    } else {
      return { id: "__NO_REPORT_ACCESS__" };
    }
  }

  // 2. Full report access (Super Admin or explicitly granted `report.view.all` by Super Admin)
  if (hasFullReportAccess(user)) {
    return andConditions.length === 1 ? andConditions[0] : { AND: andConditions };
  }

  // 3. If Super Admin saved an explicit custom list of assigned Projects/Events/IMS Group Divisions (`report.strict.scope`)
  if (p.includes("report.strict.scope")) {
    const scopedIds = user.projectScopes.map((x) => x.id);
    if (scopedIds.length === 0) {
      return { id: "__NO_ASSIGNED_PROJECTS__" };
    }
    andConditions.push({ id: { in: scopedIds } });
    return { AND: andConditions };
  }

  // 4. Default strict association for Managing Directors, Directors, Group Heads, and Managers:
  //    Only Projects, Events, or IMS Group Divisions where this user is explicitly associated.
  const assocOr: Prisma.ProjectWhereInput[] = [
    { headId: user.id },
    { checkerId: user.id },
    { directorId: user.id },
    { createdById: user.id },
  ];

  if (user.projectScopes.length > 0) {
    assocOr.push({ id: { in: user.projectScopes.map((x) => x.id) } });
  }

  andConditions.push({ OR: assocOr });
  return { AND: andConditions };
}

/**
 * Requisition filter for Financial Query & Reports (/api/reports/query).
 * Restricts requisitions to the user's permitted Projects, Events, and IMS Group Divisions.
 */
export function financialReportRequisitionScope(user: ScopeUser): Prisma.RequisitionWhereInput {
  if (hasFullReportAccess(user)) {
    return {};
  }
  return {
    project: financialReportProjectScope(user),
  };
}
