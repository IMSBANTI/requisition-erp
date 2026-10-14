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
  itCheckerId: string | null; // Sr. Manager IT & Transformation
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

  // 1. Checked by — Department / Project head (skipped for managers' own requisitions)
  if (!ctx.makerIsManager) {
    const head = [ctx.project.headId, ctx.departmentHeadId].find((h) => h && !used.has(h));
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
  const director = ctx.project.directorId ?? ctx.categoryDirectorId;
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

export type Action = "APPROVE" | "RETURN" | "REJECT" | "FORWARD" | "EXECUTE" | "MD_BATCH";

/** Which actions may this user take on this requisition right now? */
export function allowedActions(user: Actor, req: ReqSnapshot): Action[] {
  const has = (p: string) => user.permissions.includes(p);
  const out: Action[] = [];
  const step = STATUS_STEP[req.status];

  if (step) {
    let mine = false;
    if (step === "ACCOUNTS") mine = has(PERMISSIONS.REQ_ACCOUNTS_CHECK);
    else if (step === "MD") mine = has(PERMISSIONS.REQ_MD);
    else mine = req.currentAssigneeId === user.id;
    if (user.id === req.makerId) mine = false; // nobody approves their own requisition
    if (mine) out.push("APPROVE", "RETURN", "REJECT");
  }
  if (req.status === "APPROVED" && has(PERMISSIONS.REQ_FORWARD)) out.push("FORWARD");
  if (req.status === "FORWARDED" && req.executorId === user.id && has(PERMISSIONS.REQ_EXECUTE)) out.push("EXECUTE");
  if (req.mdStatus === "PENDING_BATCH" && has(PERMISSIONS.REQ_MD) && req.status !== "REJECTED" && req.status !== "RETURNED")
    out.push("MD_BATCH");
  return out;
}
