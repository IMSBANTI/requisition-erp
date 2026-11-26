export type RequisitionMode = "COMPANY" | "PROJECT" | "EVENT";

export const REQ_TYPE_PERMISSIONS = [
  "req.type.company",
  "req.type.project",
  "req.type.event",
] as const;

export type ReqTypePermission = (typeof REQ_TYPE_PERMISSIONS)[number];

export const MODE_TO_PERMISSION: Record<RequisitionMode, ReqTypePermission> = {
  COMPANY: "req.type.company",
  PROJECT: "req.type.project",
  EVENT: "req.type.event",
};

export const PERMISSION_TO_MODE: Record<ReqTypePermission, RequisitionMode> = {
  "req.type.company": "COMPANY",
  "req.type.project": "PROJECT",
  "req.type.event": "EVENT",
};

export const REQ_MODE_LABELS: Record<RequisitionMode, string> = {
  COMPANY: "IMS Group Company",
  PROJECT: "Project Requisition",
  EVENT: "Event Requisition",
};

export function isValidReqTypePermission(value: string): value is ReqTypePermission {
  return (REQ_TYPE_PERMISSIONS as readonly string[]).includes(value);
}

export function normalizeRequisitionMode(raw: string | null | undefined): RequisitionMode {
  const upper = String(raw || "PROJECT").toUpperCase().trim();
  if (upper === "COMPANY" || upper === "EVENT" || upper === "PROJECT") {
    return upper;
  }
  return "PROJECT";
}

export function modesToReqTypePermissions(modes: RequisitionMode[]): ReqTypePermission[] {
  const seen = new Set<ReqTypePermission>();
  for (const m of modes) {
    const perm = MODE_TO_PERMISSION[m];
    if (perm) seen.add(perm);
  }
  return Array.from(seen);
}

export interface ResolveReqModesInput {
  permissions?: string[] | null;
  priorityLevel?: number | null;
  levelLabel?: string | null;
  roleKey?: string | null;
  isManager?: boolean | null;
  departmentName?: string | null;
  secondaryDepartments?: string[] | null;
  hasAssignedProjects?: boolean;
  hasAssignedEvents?: boolean;
}

/**
 * Single source of truth for which Requisition Types (COMPANY / PROJECT / EVENT)
 * a user is allowed to see and submit on New Requisition and POST /api/requisitions.
 */
export function resolveAllowedRequisitionModes(
  input: ResolveReqModesInput
): RequisitionMode[] {
  const perms = input.permissions || [];

  // 1. Explicit granular flags configured by Super Admin always win
  const hasGranular = perms.some((p) => p.startsWith("req.type."));
  if (hasGranular) {
    const modes: RequisitionMode[] = [];
    if (perms.includes("req.type.company")) modes.push("COMPANY");
    if (perms.includes("req.type.project")) modes.push("PROJECT");
    if (perms.includes("req.type.event")) modes.push("EVENT");
    if (modes.length > 0) return modes;
  }

  // 2. Legacy coarse mode flags
  if (perms.includes("req.mode.company")) return ["COMPANY"];
  if (perms.includes("req.mode.project")) {
    const modes: RequisitionMode[] = [];
    if (input.hasAssignedProjects) modes.push("PROJECT");
    if (input.hasAssignedEvents) modes.push("EVENT");
    return modes.length > 0 ? modes : ["PROJECT"];
  }
  if (perms.includes("req.mode.ops_events") || perms.includes("req.mode.both")) {
    return ["COMPANY", "PROJECT", "EVENT"];
  }

  // 3. Role / priority / department defaults when no explicit override is saved
  const deptText = [
    input.departmentName || "",
    ...(input.secondaryDepartments || []),
  ]
    .join(" ")
    .toLowerCase();

  if ((input.priorityLevel ?? 2) >= 4) {
    return ["COMPANY", "PROJECT", "EVENT"];
  }
  if (deptText.includes("operation") || deptText.includes("event")) {
    return ["COMPANY", "PROJECT", "EVENT"];
  }
  if (deptText.includes("project ")) {
    return ["PROJECT"];
  }
  if (
    input.isManager ||
    input.levelLabel === "Manager" ||
    input.roleKey === "manager" ||
    input.roleKey === "sr_manager"
  ) {
    return ["COMPANY", "PROJECT", "EVENT"];
  }

  const assignedModes: RequisitionMode[] = [];
  if (input.hasAssignedProjects) assignedModes.push("PROJECT");
  if (input.hasAssignedEvents) assignedModes.push("EVENT");
  if (assignedModes.length > 0) return assignedModes;

  return ["COMPANY"];
}

/**
 * Replaces only req.type.* and legacy req.mode.* tags inside a user's extraPermissions,
 * leaving all other permissions (report scopes, security flags, backup approver, etc.) intact.
 */
export function mergeReqTypePermissions(
  existingExtraPermissions: string[] | null | undefined,
  nextReqTypePerms: string[]
): string[] {
  const validNext = Array.from(
    new Set(nextReqTypePerms.filter(isValidReqTypePermission))
  );
  if (validNext.length === 0) {
    throw new Error("At least one requisition type must be selected.");
  }
  const preserved = (existingExtraPermissions || []).filter(
    (p) => !p.startsWith("req.type.") && !p.startsWith("req.mode.")
  );
  return Array.from(new Set([...preserved, ...validNext]));
}
