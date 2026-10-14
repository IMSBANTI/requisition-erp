import { describe, expect, it } from "vitest";
import { allowedActions, resolveChain, stateAfter, WorkflowContext, WorkflowError } from "@/lib/workflow";

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
  it("only the assigned head can sign", () => {
    expect(allowedActions({ id: "pm", permissions: ["req.approve"] }, req)).toEqual(["APPROVE", "RETURN", "REJECT"]);
    expect(allowedActions({ id: "other", permissions: ["req.approve"] }, req)).toEqual([]);
  });
  it("any accounts manager can do the accounts check", () => {
    const r = { ...req, status: "PENDING_ACCOUNTS", currentAssigneeId: null };
    expect(allowedActions({ id: "harun", permissions: ["req.accounts.check"] }, r)).toContain("APPROVE");
    expect(allowedActions({ id: "sumon", permissions: ["req.execute"] }, r)).toEqual([]);
  });
  it("maker cannot approve own requisition", () => {
    const r = { ...req, status: "PENDING_MD", makerId: "md" };
    expect(allowedActions({ id: "md", permissions: ["req.md"] }, r)).not.toContain("APPROVE");
  });
  it("forward and execute", () => {
    expect(allowedActions({ id: "harun", permissions: ["req.forward"] }, { ...req, status: "APPROVED" })).toContain("FORWARD");
    const f = { ...req, status: "FORWARDED", executorId: "tanni" };
    expect(allowedActions({ id: "tanni", permissions: ["req.execute"] }, f)).toEqual(["EXECUTE"]);
    expect(allowedActions({ id: "sumon", permissions: ["req.execute"] }, f)).toEqual([]);
  });
  it("MD can batch-sign released requisitions", () => {
    const r = { ...req, status: "EXECUTED", mdStatus: "PENDING_BATCH" };
    expect(allowedActions({ id: "md", permissions: ["req.md"] }, r)).toEqual(["MD_BATCH"]);
  });
});
