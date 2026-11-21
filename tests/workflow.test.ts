import { describe, expect, it } from "vitest";
import {
  allowedActions,
  backupApproverPermissionTag,
  extractBackupApproverId,
  resolveChain,
  stateAfter,
  WorkflowContext,
  WorkflowError,
} from "@/lib/workflow";

const base: WorkflowContext = {
  makerId: "exec",
  makerIsManager: false,
  makerPermissions: ["req.create"],
  category: "IMS_OUTSOURCING_STUDIO",
  project: { headId: "pm", checkerId: null, directorId: null, mdApprovalMode: "INSTANT", releaseBeforeMd: true },
  departmentHeadId: "depthead",
  itCheckerId: "abir",
  categoryDirectorId: "iftekhar",
};

const steps = (c: ReturnType<typeof resolveChain>) => c.map((s) => s.step + (s.assigneeId ? ":" + s.assigneeId : ""));

describe("resolveChain", () => {
  it("executive: head → accounts → director → MD", () => {
    expect(steps(resolveChain(base))).toEqual(["HEAD:pm", "ACCOUNTS", "DIRECTOR:iftekhar", "MD"]);
  });
  it("falls back to department head when project has no head", () => {
    const c = resolveChain({ ...base, project: { ...base.project, headId: null } });
    expect(steps(c)[0]).toBe("HEAD:depthead");
  });
  it("includes optional project checker", () => {
    const c = resolveChain({ ...base, project: { ...base.project, checkerId: "srmgr" } });
    expect(steps(c)).toEqual(["HEAD:pm", "CHECKER:srmgr", "ACCOUNTS", "DIRECTOR:iftekhar", "MD"]);
  });
  it("routes AI/IT requisitions to Sr. Manager IT as checker", () => {
    const c = resolveChain({ ...base, category: "AI_IT", project: { ...base.project, checkerId: "srmgr" } });
    expect(steps(c)).toContain("CHECKER:abir");
    expect(steps(c)).not.toContain("CHECKER:srmgr");
  });
  it("manager's own requisition skips the head step", () => {
    const c = resolveChain({ ...base, makerId: "pm", makerIsManager: true });
    expect(steps(c)).toEqual(["ACCOUNTS", "DIRECTOR:iftekhar", "MD"]);
  });
  it("never assigns the maker as their own head", () => {
    const c = resolveChain({ ...base, makerId: "pm" });
    expect(steps(c)[0]).toBe("HEAD:depthead");
  });
  it("project director overrides category director", () => {
    const c = resolveChain({ ...base, project: { ...base.project, directorId: "shible" } });
    expect(steps(c)).toContain("DIRECTOR:shible");
  });
  it("director is mandatory", () => {
    expect(() => resolveChain({ ...base, categoryDirectorId: null })).toThrow(WorkflowError);
  });
  it("accounts manager as maker skips accounts check", () => {
    const c = resolveChain({ ...base, makerId: "harun", makerIsManager: true, makerPermissions: ["req.accounts.check"] });
    expect(steps(c)).toEqual(["DIRECTOR:iftekhar", "MD"]);
  });
  it("director as maker goes straight to MD (instant)", () => {
    const c = resolveChain({
      ...base, makerId: "iftekhar", makerIsManager: true,
      project: { ...base.project, mdApprovalMode: "MONTHLY" },
    });
    expect(steps(c)).toEqual(["ACCOUNTS", "MD"]);
    expect(c[1].batch).toBe(false);
  });
  it("marks MD as batch for weekly/monthly projects", () => {
    const c = resolveChain({ ...base, project: { ...base.project, mdApprovalMode: "WEEKLY" } });
    expect(c.at(-1)).toMatchObject({ step: "MD", batch: true });
  });
});

describe("stateAfter", () => {
  it("walks the instant chain to APPROVED", () => {
    const c = resolveChain(base);
    expect(stateAfter(c, 0, true)).toMatchObject({ status: "PENDING_HEAD", assigneeId: "pm", mdStatus: "PENDING" });
    expect(stateAfter(c, 1, true)).toMatchObject({ status: "PENDING_ACCOUNTS", assigneeId: null });
    expect(stateAfter(c, 2, true)).toMatchObject({ status: "PENDING_DIRECTOR", assigneeId: "iftekhar" });
    expect(stateAfter(c, 3, true)).toMatchObject({ status: "PENDING_MD" });
    expect(stateAfter(c, 4, true)).toMatchObject({ status: "APPROVED", mdStatus: "APPROVED" });
  });
  it("batch + release before MD: APPROVED after Director, MD pending batch", () => {
    const c = resolveChain({ ...base, project: { ...base.project, mdApprovalMode: "MONTHLY" } });
    expect(stateAfter(c, 3, true)).toMatchObject({ status: "APPROVED", mdStatus: "PENDING_BATCH" });
  });
  it("batch without release: waits in PENDING_MD batch queue", () => {
    const c = resolveChain({ ...base, project: { ...base.project, mdApprovalMode: "MONTHLY" } });
    expect(stateAfter(c, 3, false)).toMatchObject({ status: "PENDING_MD", mdStatus: "PENDING_BATCH" });
    expect(stateAfter(c, 4, false)).toMatchObject({ status: "APPROVED", mdStatus: "APPROVED" });
  });
});

describe("allowedActions", () => {
  const req = { status: "PENDING_HEAD", makerId: "exec", currentAssigneeId: "pm", executorId: null, mdStatus: "PENDING" };
  it("assigned head can approve or route to accounts/director, return, or reject", () => {
    const actions = allowedActions({ id: "pm", permissions: ["req.approve"] }, req);
    expect(actions).toEqual(
      expect.arrayContaining(["APPROVE", "APPROVE_TO_ACCOUNTS", "APPROVE_TO_DIRECTOR", "RETURN", "REJECT"])
    );
    expect(allowedActions({ id: "exec", permissions: ["req.approve"] }, req)).toEqual([]);
  });
  it("accounts manager can route to director/MD, forward, execute, return, or reject at PENDING_ACCOUNTS", () => {
    const r = { ...req, status: "PENDING_ACCOUNTS", currentAssigneeId: null };
    const actions = allowedActions({ id: "harun", permissions: ["req.accounts.check"] }, r);
    expect(actions).toEqual(
      expect.arrayContaining(["APPROVE_TO_DIRECTOR", "APPROVE_TO_MD", "FORWARD", "EXECUTE", "RETURN", "REJECT"])
    );
    expect(allowedActions({ id: "sumon", permissions: ["req.execute"] }, r)).toContain("EXECUTE");
  });
  it("maker cannot approve, return, or reject own requisition", () => {
    const r = { ...req, status: "PENDING_MD", makerId: "md" };
    expect(allowedActions({ id: "md", permissions: ["req.md"] }, r)).toEqual([]);
    const rDir = { ...req, status: "PENDING_DIRECTOR", makerId: "dir" };
    expect(allowedActions({ id: "dir", permissions: ["req.director"] }, rDir)).toEqual([]);
  });
  it("forward, execute, and settle", () => {
    expect(allowedActions({ id: "harun", permissions: ["req.forward"] }, { ...req, status: "APPROVED" })).toContain("FORWARD");
    const f = { ...req, status: "FORWARDED", executorId: "tanni" };
    expect(allowedActions({ id: "tanni", permissions: ["req.execute"] }, f)).toEqual(["EXECUTE", "SETTLE"]);
    expect(allowedActions({ id: "exec", permissions: ["req.create"] }, f)).toEqual([]);
  });
  it("MD can batch-sign released requisitions", () => {
    const r = { ...req, status: "EXECUTED", mdStatus: "PENDING_BATCH" };
    expect(allowedActions({ id: "md", permissions: ["req.md"] }, r)).toEqual(["MD_BATCH"]);
  });
  it("backup approver can sign PENDING_HEAD requisition even without generic req.approve", () => {
    const tag = backupApproverPermissionTag("rakib");
    expect(extractBackupApproverId(["report.view", tag])).toBe("rakib");
    const r = { ...req, status: "PENDING_HEAD", currentAssigneeId: "polok", backupApproverId: "rakib" };
    const actions = allowedActions({ id: "rakib", permissions: ["req.create"] }, r);
    expect(actions).toEqual(
      expect.arrayContaining(["APPROVE", "APPROVE_TO_ACCOUNTS", "APPROVE_TO_DIRECTOR", "RETURN", "REJECT"])
    );
    // Self-approval still blocked even if backupApproverId === makerId
    const selfReq = { ...r, makerId: "rakib" };
    expect(allowedActions({ id: "rakib", permissions: ["req.create"] }, selfReq)).toEqual([]);
  });
});
