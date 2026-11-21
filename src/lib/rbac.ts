import type { Prisma } from "@prisma/client";
import { PERMISSIONS } from "./constants";
import { backupApproverPermissionTag } from "./workflow";

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
 * Prisma `where` filter restricting which requisitions a user can see in All Requisitions (/requisitions) & Dashboard (/):
 * - ONLY Central Accounts (Harun, Israt Jahan, Sumon) and Super Admin (IT) — or a user explicitly
 *   granted `report.view.all` without `report.strict.scope` — see ALL requisitions.
 * - Everyone else (including Murshalin Mahmud Polok, Group Heads, Managers, Directors, MDs, and Executives)
 *   ONLY sees requisitions they are directly involved in:
 *   1. Requisitions they created themselves (`makerId: user.id`)
 *   2. Requisitions currently waiting for their signature (`currentAssigneeId: user.id`)
 *   3. Requisitions they have already signed/approved/returned/rejected (`approvals: { some: { userId: user.id } }`)
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

  // Strict personal & signature involvement only for all non-Accounts / non-Super-Admin users
  const or: Prisma.RequisitionWhereInput[] = [
    { makerId: user.id },
    { currentAssigneeId: user.id },
    { executorId: user.id },
    { approvals: { some: { userId: user.id } } },
    {
      AND: [
        { status: "PENDING_HEAD" },
        { maker: { extraPermissions: { has: backupApproverPermissionTag(user.id) } } },
      ],
    },
  ];

  // For Managing Directors (where MD step has assigneeId: null), include PENDING_MD / PENDING_BATCH requisitions on their assigned projects
  if (p.includes(PERMISSIONS.REQ_MD)) {
    or.push({
      AND: [
        { OR: [{ status: "PENDING_MD" }, { mdStatus: "PENDING_BATCH" }] },
        { project: financialReportProjectScope(user) },
      ],
    });
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
  // Managing Directors and Central Accounts have full report visibility across all Projects, Events & IMS Group
  // unless Super Admin explicitly restricted their scope.
  if (
    (p.includes(PERMISSIONS.REQ_MD) ||
      p.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK) ||
      p.includes(PERMISSIONS.REQ_EXECUTE)) &&
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
export function canAccessFinancialReports(user: ScopeUser & { role?: { isManager?: boolean; key?: string } | null }): boolean {
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

export interface ProjectAdminUser extends ScopeUser {
  designation?: string | null;
  levelLabel?: string | null;
  role?: { key?: string; name?: string; isManager?: boolean } | null;
}

/**
 * Identifies a KAM (Key Account Manager) — KAMs raise requisitions and view their assigned
 * projects' financial reports, but NEVER have Administration / Project Setup access.
 */
export function isKamUser(user: ProjectAdminUser): boolean {
  const level = String(user.levelLabel || "").trim().toUpperCase();
  if (level === "KAM") return true;
  const desig = String(user.designation || "");
  return /\bkam\b|key account manager/i.test(desig);
}

export interface ProjectAdminAccess {
  /** Super Admin (P5 or admin.users): full create/edit/delete across all projects */
  isSystemAdmin: boolean;
  /** Allowed to see Administration -> Projects & Workflows and open /admin/projects */
  canAccessProjectsAdmin: boolean;
  /** Allowed to create new projects/events */
  canCreateProject: boolean;
  /** Allowed to permanently delete projects/events (System Admin only) */
  canDeleteProject: boolean;
  accessMode: "ADMIN" | "GROUP_HEAD" | "PROJECT_MANAGER" | "READ_ONLY" | "NONE";
}

/**
 * Strict RBAC for Administration -> Projects & Workflows (/admin/projects & /api/admin/projects).
 * - Super Admin (P5 / admin.users): Full access (all projects, Create, Edit, Delete)
 * - KAMs & Executives: NO Administration access (cannot view, edit, or create projects)
 * - Directors / MD: Access + Create + Edit assigned/scoped projects
 * - Group Project Head (sr_manager or assigned project headId): Access + Create + Edit assigned projects (others read-only)
 * - Project Manager (manager role, non-KAM, or assigned checkerId): Access + Edit assigned projects / Read-Only others (cannot create)
 * - HR (admin.readonly): Read-Only access
 */
export function getProjectAdminAccess(
  user: ProjectAdminUser,
  opts?: { isAssignedProjectHead?: boolean; isAssignedProjectChecker?: boolean }
): ProjectAdminAccess {
  const p = user.permissions;
  const isSystemAdmin =
    (user.priorityLevel ?? 2) >= 5 || p.includes(PERMISSIONS.ADMIN_USERS);

  if (isSystemAdmin) {
    return {
      isSystemAdmin: true,
      canAccessProjectsAdmin: true,
      canCreateProject: true,
      canDeleteProject: true,
      accessMode: "ADMIN",
    };
  }

  // KAMs and Managing Directors do not need Administration / Project Setup access
  // (MDs have full visibility across all Financial Reports instead)
  if (isKamUser(user) || p.includes(PERMISSIONS.REQ_MD)) {
    return {
      isSystemAdmin: false,
      canAccessProjectsAdmin: false,
      canCreateProject: false,
      canDeleteProject: false,
      accessMode: "NONE",
    };
  }

  const isDirector = p.includes(PERMISSIONS.REQ_DIRECTOR);
  const roleKey = String(user.role?.key || "").toLowerCase();
  const isGroupProjectHead =
    roleKey === "sr_manager" || Boolean(opts?.isAssignedProjectHead);

  if (isDirector || isGroupProjectHead) {
    return {
      isSystemAdmin: false,
      canAccessProjectsAdmin: true,
      canCreateProject: true,
      canDeleteProject: false,
      accessMode: "GROUP_HEAD",
    };
  }

  const isProjectManager =
    roleKey === "manager" || Boolean(opts?.isAssignedProjectChecker);

  if (isProjectManager) {
    return {
      isSystemAdmin: false,
      canAccessProjectsAdmin: true,
      canCreateProject: false,
      canDeleteProject: false,
      accessMode: "PROJECT_MANAGER",
    };
  }

  if (p.includes(PERMISSIONS.ADMIN_READONLY)) {
    return {
      isSystemAdmin: false,
      canAccessProjectsAdmin: true,
      canCreateProject: false,
      canDeleteProject: false,
      accessMode: "READ_ONLY",
    };
  }

  return {
    isSystemAdmin: false,
    canAccessProjectsAdmin: false,
    canCreateProject: false,
    canDeleteProject: false,
    accessMode: "NONE",
  };
}

export function canEditSingleProject(
  user: ProjectAdminUser,
  project: {
    headId?: string | null;
    checkerId?: string | null;
    directorId?: string | null;
    createdById?: string | null;
  }
): boolean {
  const access = getProjectAdminAccess(user, {
    isAssignedProjectHead: project.headId === user.id,
    isAssignedProjectChecker: project.checkerId === user.id,
  });
  if (!access.canAccessProjectsAdmin) return false;
  if (access.isSystemAdmin) return true;
  if (access.accessMode === "READ_ONLY") return false;

  const p = user.permissions;
  if (p.includes(PERMISSIONS.REQ_MD) && hasFullReportAccess(user)) {
    return true;
  }
  if (p.includes(PERMISSIONS.REQ_DIRECTOR) && project.directorId === user.id) {
    return true;
  }
  return (
    project.headId === user.id ||
    project.checkerId === user.id ||
    project.createdById === user.id
  );
}
