import { describe, it, expect } from "vitest";
import {
  resolveAllowedRequisitionModes,
  mergeReqTypePermissions,
  modesToReqTypePermissions,
} from "../reqTypes";

describe("Requisition Type Access (reqTypes)", () => {
  it("prioritizes explicit req.type.* overrides even for Priority 4/5 or Managers", () => {
    expect(
      resolveAllowedRequisitionModes({
        permissions: ["req.type.project"],
        priorityLevel: 4,
        isManager: true,
        departmentName: "Operations & Events",
      })
    ).toEqual(["PROJECT"]);

    expect(
      resolveAllowedRequisitionModes({
        permissions: ["req.type.project", "req.type.event"],
        priorityLevel: 5,
      })
    ).toEqual(["PROJECT", "EVENT"]);

    expect(
      resolveAllowedRequisitionModes({
        permissions: ["req.type.company"],
        hasAssignedProjects: true,
        hasAssignedEvents: true,
      })
    ).toEqual(["COMPANY"]);
  });

  it("falls back cleanly to role, department, and assigned projects when unconfigured", () => {
    expect(
      resolveAllowedRequisitionModes({
        permissions: [],
        priorityLevel: 2,
        departmentName: "Project Robi",
      })
    ).toEqual(["PROJECT"]);

    expect(
      resolveAllowedRequisitionModes({
        permissions: [],
        priorityLevel: 2,
        departmentName: "HR & Admin",
      })
    ).toEqual(["COMPANY"]);

    expect(
      resolveAllowedRequisitionModes({
        permissions: [],
        priorityLevel: 2,
        hasAssignedProjects: true,
        hasAssignedEvents: true,
      })
    ).toEqual(["PROJECT", "EVENT"]);

    expect(
      resolveAllowedRequisitionModes({
        permissions: [],
        priorityLevel: 3,
        isManager: true,
      })
    ).toEqual(["COMPANY", "PROJECT", "EVENT"]);
  });

  it("merges req.type.* permissions without disturbing unrelated extraPermissions", () => {
    const merged = mergeReqTypePermissions(
      [
        "report.strict.scope",
        "req.mode.both",
        "req.type.company",
        "security.allow_remote_ip",
        "backup.approver:user-99",
      ],
      ["req.type.project", "req.type.event"]
    );

    expect(merged).toContain("report.strict.scope");
    expect(merged).toContain("security.allow_remote_ip");
    expect(merged).toContain("backup.approver:user-99");
    expect(merged).toContain("req.type.project");
    expect(merged).toContain("req.type.event");
    expect(merged).not.toContain("req.type.company");
    expect(merged).not.toContain("req.mode.both");
  });

  it("rejects empty requisition type list in mergeReqTypePermissions", () => {
    expect(() => mergeReqTypePermissions(["req.type.company"], [])).toThrow();
    expect(modesToReqTypePermissions(["PROJECT", "EVENT"])).toEqual([
      "req.type.project",
      "req.type.event",
    ]);
  });
});
