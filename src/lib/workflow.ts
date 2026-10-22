/**
 * Requisition approval workflow — pure logic (no database), fully unit-tested.
 *
 * Paper form boxes:  Requested by | Checked by | Checked by | Checked by Accounts | Approve by management
 * Chain:             MAKER        → HEAD       → CHECKER    → ACCOUNTS            → DIRECTOR → MD
 * Then:              APPROVED → (Accounts Manager) FORWARDED → (Accounts Executive) EXECUTED
 */
import { PERMISSIONS } from "./constants";

export type Step = "HEAD" | "CHECKER" | "ACCOUNTS" | "DIRECTOR" | "MD";

export interface ChainStep {
  step: Step;
  /** Specific user who must sign; null = any user holding `permission`. */
  assigneeId: string | null;
  permission?: string;
  /** MD only: approve later in a weekly / monthly batch */
  batch?: boolean;
}

export interface WorkflowContext {
  makerId: string;
  makerIsManager: boolean;
  makerPermissions: string[];
  category: string;
  project: {
    headId: string | null;
    checkerId: string | null;
    directorId: string | null;
    mdApprovalMode: string; // INSTANT | WEEKLY | MONTHLY
    releaseBeforeMd: boolean;
  };
  departmentHeadId: string | null;
  supervisorId?: string | null;
  itCheckerId: string | null; // Sr. Manager, Information & Transformation
  categoryDirectorId: string | null;
  makerIsMd?: boolean;
}

export const STEP_STATUS: Record<Step, string> = {
  HEAD: "PENDING_HEAD",
  CHECKER: "PENDING_CHECKER",
  ACCOUNTS: "PENDING_ACCOUNTS",
  DIRECTOR: "PENDING_DIRECTOR",
  MD: "PENDING_MD",
};

export const STATUS_STEP: Record<string, Step> = Object.fromEntries(
  Object.entries(STEP_STATUS).map(([k, v]) => [v, k as Step]),
) as Record<string, Step>;

export class WorkflowError extends Error {}

/** Build the ordered list of approval steps for a new / resubmitted requisition. */
export function resolveChain(ctx: WorkflowContext): ChainStep[] {
  const chain: ChainStep[] = [];
  const maker = ctx.makerId;
  const used = new Set<string>([maker]);
  const director = ctx.project.directorId ?? ctx.categoryDirectorId;

  // 1. Checked by — Direct Supervisor / Project Head / Department Head (skipped for managers' own requisitions)
  if (!ctx.makerIsManager) {
    const head = [ctx.supervisorId, ctx.project.headId, ctx.departmentHeadId].find(
      (h) => h && !used.has(h) && h !== director
    );
    if (head) {
      chain.push({ step: "HEAD", assigneeId: head });
      used.add(head);
    }
  }

  // 2. Checked by — AI/IT requisitions go to Sr. Manager IT; otherwise optional project checker
  const checker = ctx.category === "AI_IT" && ctx.itCheckerId ? ctx.itCheckerId : ctx.project.checkerId;
  if (checker && !used.has(checker)) {
    chain.push({ step: "CHECKER", assigneeId: checker });
    used.add(checker);
  }

  // 3. Checked by Accounts — any Accounts Manager (skipped if the maker is Accounts Manager)
  if (!ctx.makerPermissions.includes(PERMISSIONS.REQ_ACCOUNTS_CHECK)) {
    chain.push({ step: "ACCOUNTS", assigneeId: null, permission: PERMISSIONS.REQ_ACCOUNTS_CHECK });
  }

  // 4. Director — mandatory
  const makerIsDirector = director === maker;
  if (!director) throw new WorkflowError("No Director is configured for this project/category. Ask Admin to set one.");
  if (!makerIsDirector) chain.push({ step: "DIRECTOR", assigneeId: director });

  // 5. Managing Director — instant or weekly/monthly batch (always instant when a Director is the maker)
  if (!ctx.makerIsMd) {
    const batch = !makerIsDirector && ctx.project.mdApprovalMode !== "INSTANT";
    chain.push({ step: "MD", assigneeId: null, permission: PERMISSIONS.REQ_MD, batch });
  }
  return chain;
}

export interface WorkflowState {
  status: string;
  step: Step | null;
  assigneeId: string | null;
  mdStatus: "NOT_REQUIRED" | "PENDING" | "PENDING_BATCH" | "APPROVED";
}

/**
 * State after `completed` steps of the chain are signed (0 = just submitted).
 * Batch-MD projects with releaseBeforeMd jump straight to APPROVED after the Director;
 * the MD signs later in the batch screen (mdStatus PENDING_BATCH -> APPROVED).
 */
export function stateAfter(chain: ChainStep[], completed: number, releaseBeforeMd: boolean): WorkflowState {
  const md = chain.find((s) => s.step === "MD");
  const next = chain[completed];
  if (!next) {
    return { status: "APPROVED", step: null, assigneeId: null, mdStatus: md ? "APPROVED" : "NOT_REQUIRED" };
  }
  if (next.step === "MD" && next.batch) {
    if (releaseBeforeMd) return { status: "APPROVED", step: null, assigneeId: null, mdStatus: "PENDING_BATCH" };
    return { status: "PENDING_MD", step: "MD", assigneeId: null, mdStatus: "PENDING_BATCH" };
  }
  return {
    status: STEP_STATUS[next.step],
    step: next.step,
    assigneeId: next.assigneeId,
    mdStatus: md ? "PENDING" : "NOT_REQUIRED",
  };
}

export interface Actor {
  id: string;
  permissions: string[];
}

export interface ReqSnapshot {
  status: string;
  makerId: string;
  currentAssigneeId: string | null;
  executorId: string | null;
  mdStatus: string;
}

export type Action =
  | "APPROVE"
  | "APPROVE_TO_ACCOUNTS"
  | "APPROVE_TO_DIRECTOR"
  | "APPROVE_TO_MD"
  | "FORWARD"
  | "EXECUTE"
  | "RETURN"
  | "REJECT"
  | "MD_BATCH";

/** Which actions may this user take on this requisition right now? */
export function allowedActions(user: Actor, req: ReqSnapshot): Action[] {
  const has = (p: string) => user.permissions.includes(p);
  const out = new Set<Action>();

  const isClosed = ["EXECUTED", "REJECTED", "CANCELLED", "DRAFT"].includes(req.status);
  const isPendingStage = [
    "PENDING_HEAD",
    "PENDING_CHECKER",
    "PENDING_ACCOUNTS",
    "PENDING_DIRECTOR",
    "PENDING_MD",
  ].includes(req.status);

  if (!isClosed) {
    // 1. Director actions (Iftekhar, Nazmus, Shible, etc.)
    if (has(PERMISSIONS.REQ_DIRECTOR) && isPendingStage) {
      out.add("APPROVE_TO_ACCOUNTS");
      out.add("APPROVE_TO_MD");
      out.add("RETURN");
      out.add("REJECT");
    }

    // 2. Managing Director actions (Sami Hasan, Syed Sarwar Morshed Azam)
    if (has(PERMISSIONS.REQ_MD) && (isPendingStage || req.mdStatus === "PENDING_BATCH")) {
      out.add("APPROVE_TO_ACCOUNTS");
      out.add("RETURN");
      out.add("REJECT");
    }

    // 3. Accounts Manager actions (Harun Ur-Rashid, etc.)
    if (has(PERMISSIONS.REQ_ACCOUNTS_CHECK) || has(PERMISSIONS.REQ_FORWARD)) {
      if (isPendingStage) {
        out.add("APPROVE_TO_DIRECTOR");
        out.add("APPROVE_TO_MD");
        out.add("FORWARD");
        out.add("EXECUTE");
        out.add("RETURN");
        out.add("REJECT");
      } else if (req.status === "APPROVED" || req.status === "FORWARDED") {
        out.add("APPROVE_TO_MD");
        out.add("FORWARD");
        out.add("EXECUTE");
      }
    }

    // 4. Accounts Executive actions (Israt Jahan Tanni, Sumon)
    if (has(PERMISSIONS.REQ_EXECUTE)) {
      if (
        req.status === "FORWARDED" ||
        req.status === "APPROVED" ||
        req.status === "PENDING_ACCOUNTS"
      ) {
        out.add("EXECUTE");
      }
    }

    // 5. Manager / Department Head / Project Head / IT Checker actions
    const isHeadOrCheckerStage =
      req.status === "PENDING_HEAD" || req.status === "PENDING_CHECKER";
    const canSignHeadOrChecker =
      req.currentAssigneeId === user.id ||
      has(PERMISSIONS.REQ_APPROVE) ||
      has(PERMISSIONS.REQ_APPROVE_IT);

    if (isHeadOrCheckerStage && canSignHeadOrChecker && !has(PERMISSIONS.REQ_DIRECTOR)) {
      out.add("APPROVE");
      out.add("APPROVE_TO_ACCOUNTS");
      out.add("APPROVE_TO_DIRECTOR");
      out.add("RETURN");
      out.add("REJECT");
    }
  }

  if (
    req.mdStatus === "PENDING_BATCH" &&
    has(PERMISSIONS.REQ_MD) &&
    req.status !== "REJECTED" &&
    req.status !== "RETURNED"
  ) {
    out.add("MD_BATCH");
  }

  return Array.from(out);
}

