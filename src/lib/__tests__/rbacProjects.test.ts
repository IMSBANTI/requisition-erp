import { describe, expect, it } from "vitest";
import {
  canEditSingleProject,
  getProjectAdminAccess,
  ProjectAdminUser,
} from "@/lib/rbac";

const baseUser: ProjectAdminUser = {
  id: "u1",
  priorityLevel: 2,
  permissions: ["req.create", "report.view"],
  departmentId: null,
  companyScopes: [],
  projectScopes: [],
  levelLabel: "Executive",
  designation: "Executive",
  role: { key: "executive", name: "Executive", isManager: false },
};

describe("Projects Administration RBAC (getProjectAdminAccess & canEditSingleProject)", () => {
  it("blocks KAMs (like Ruhan Kabir) from Administration, creating, editing, or deleting projects even if manager role or project.manage was set", () => {
    const kam: ProjectAdminUser = {
      ...baseUser,
      id: "ruhan",
      priorityLevel: 3,
      levelLabel: "KAM",
      designation: "KAM, Project Robi & DBH",
      role: { key: "manager", name: "Manager", isManager: true },
      permissions: ["req.create", "report.view", "project.manage"],
    };

    const access = getProjectAdminAccess(kam, { isAssignedProjectHead: false });
    expect(access.canAccessProjectsAdmin).toBe(false);
    expect(access.canCreateProject).toBe(false);
    expect(access.canDeleteProject).toBe(false);
    expect(access.accessMode).toBe("NONE");
    expect(canEditSingleProject(kam, { headId: "polok", checkerId: "rakib" })).toBe(false);
  });

  it("allows Group Project Head (sr_manager / headId) to access, create, and edit assigned projects but not delete", () => {
    const groupHead: ProjectAdminUser = {
      ...baseUser,
      id: "polok",
      priorityLevel: 4,
      levelLabel: "Manager",
      designation: "Head of Outsourcing",
      role: { key: "sr_manager", name: "Senior Manager / Head", isManager: true },
      permissions: ["req.create", "req.approve", "report.view"],
    };

    const access = getProjectAdminAccess(groupHead, { isAssignedProjectHead: true });
    expect(access.canAccessProjectsAdmin).toBe(true);
    expect(access.canCreateProject).toBe(true);
    expect(access.canDeleteProject).toBe(false);
    expect(access.accessMode).toBe("GROUP_HEAD");
    expect(canEditSingleProject(groupHead, { headId: "polok" })).toBe(true);
    expect(canEditSingleProject(groupHead, { headId: "other" })).toBe(false);
  });

  it("allows Project Manager (non-KAM manager) edit on assigned projects and read-only on others, without create or delete", () => {
    const pm: ProjectAdminUser = {
      ...baseUser,
      id: "pm1",
      priorityLevel: 3,
      levelLabel: "Manager",
      designation: "Manager, Operations",
      role: { key: "manager", name: "Manager", isManager: true },
      permissions: ["req.create", "req.approve", "report.view"],
    };

    const access = getProjectAdminAccess(pm);
    expect(access.canAccessProjectsAdmin).toBe(true);
    expect(access.canCreateProject).toBe(false);
    expect(access.canDeleteProject).toBe(false);
    expect(access.accessMode).toBe("PROJECT_MANAGER");
    expect(canEditSingleProject(pm, { headId: "polok", checkerId: "pm1" })).toBe(true);
    expect(canEditSingleProject(pm, { headId: "polok", checkerId: "other" })).toBe(false);
  });

  it("gives Super Admin full create/edit/delete access across all projects", () => {
    const admin: ProjectAdminUser = {
      ...baseUser,
      id: "abir",
      priorityLevel: 5,
      permissions: ["admin.users", "project.manage"],
      role: { key: "super_admin", name: "Super Admin", isManager: true },
    };

    const access = getProjectAdminAccess(admin);
    expect(access.isSystemAdmin).toBe(true);
    expect(access.canAccessProjectsAdmin).toBe(true);
    expect(access.canCreateProject).toBe(true);
    expect(access.canDeleteProject).toBe(true);
    expect(canEditSingleProject(admin, { headId: "polok" })).toBe(true);
  });
});
