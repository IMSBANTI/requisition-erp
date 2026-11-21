"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PERMISSION_LABELS, CATEGORIES, Permission } from "@/lib/constants";
import { syncDesignationWithLevel } from "@/lib/userDisplay";
import {
  BACKUP_APPROVER_PREFIX,
  backupApproverPermissionTag,
  extractBackupApproverId,
} from "@/lib/workflow";
import { useToast } from "@/components/ToastProvider";

interface Props {
  users: any[];
  roles: any[];
  companies: any[];
  departments: any[];
  projects: any[];
  isReadOnly: boolean;
}

const PRIORITY_BADGES: Record<number, { label: string; color: string }> = {
  5: { label: "P5 • Super Admin", color: "bg-purple-100 text-purple-800 border-purple-200" },
  4: { label: "P4 • Director / MD / Sr.", color: "bg-red-100 text-red-800 border-red-200" },
  3: { label: "P3 • Manager / Lead", color: "bg-blue-100 text-blue-800 border-blue-200" },
  2: { label: "P2 • Executive", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  1: { label: "P1 • Staff", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

export default function AdminUsersClient({
  users,
  roles,
  companies,
  departments,
  projects,
  isReadOnly,
}: Props) {
  const router = useRouter();
  const { toast, confirmDialog } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Modal states: "CREATE_USER" | "EDIT_USER" | "PASSWORD" | "PROJECT_MANAGER" | null
  const [modalType, setModalType] = useState<
    "CREATE_USER" | "EDIT_USER" | "PASSWORD" | "PROJECT_MANAGER" | null
  >(null);
  const [userModalTab, setUserModalTab] = useState<"PROFILE" | "ROUTING" | "SCOPES">("PROFILE");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Password Reset state
  const [newPassword, setNewPassword] = useState("");

  // User Create / Edit Form State
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [designation, setDesignation] = useState("");
  const [priorityLevel, setPriorityLevel] = useState<number>(2);
  const [levelLabel, setLevelLabel] = useState("Executive");
  const [roleId, setRoleId] = useState(roles[0]?.id || "");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [secondaryDeptsText, setSecondaryDeptsText] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [backupApproverId, setBackupApproverId] = useState("");
  const [companyScopeIds, setCompanyScopeIds] = useState<string[]>([]);
  const [projectScopeIds, setProjectScopeIds] = useState<string[]>([]);
  const [directorCategories, setDirectorCategories] = useState<string[]>([]);
  const [extraPermissions, setExtraPermissions] = useState<string[]>([]);
  const [reqTypesAllowed, setReqTypesAllowed] = useState<string[]>([
    "req.type.company",
  ]);
  const [reportAccessMode, setReportAccessMode] = useState<
    "ASSIGNED_ONLY" | "ALL_REPORTS" | "NONE"
  >("ASSIGNED_ONLY");
  const [reportCategories, setReportCategories] = useState<string[]>([
    "report.scope.projects",
    "report.scope.events",
    "report.scope.company",
  ]);
  const [active, setActive] = useState(true);
  const [projectSearchFilter, setProjectSearchFilter] = useState("");

  // Quick Project / Event Creator & Renamer State
  const [projMode, setProjMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [selectedProjId, setSelectedProjId] = useState("");
  const [projKind, setProjKind] = useState<"PERMANENT" | "EVENT">("PERMANENT");
  const [projCompanyId, setProjCompanyId] = useState(companies[0]?.id || "");
  const [projCode, setProjCode] = useState("");
  const [projName, setProjName] = useState("");
  const [projCategory, setProjCategory] = useState("GENERAL");
  const [projHeadId, setProjHeadId] = useState("");
  const [projDirectorId, setProjDirectorId] = useState("");
  const [projMemberIds, setProjMemberIds] = useState<string[]>([]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (companyFilter !== "ALL") {
        if (companyFilter === "IMS_GROUP") {
          const isGroupOfficer = !u.companyId || (u.companyScopeCodes?.length ?? 0) >= 4;
          if (!isGroupOfficer) return false;
        } else {
          const inPrimary = u.companyId === companyFilter || !u.companyId;
          const inScopes = u.companyScopeIds?.includes(companyFilter);
          if (!inPrimary && !inScopes) return false;
        }
      }
      if (priorityFilter !== "ALL" && String(u.priorityLevel) !== priorityFilter) {
        return false;
      }
      if (roleFilter !== "ALL" && u.roleId !== roleFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchEmp = (u.employeeId || "").toLowerCase().includes(q);
        const matchName = u.name.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchDept =
          (u.departmentName || "").toLowerCase().includes(q) ||
          (u.secondaryDepartments || []).some((d: string) => d.toLowerCase().includes(q));
        const matchProj = (u.projectScopeNames || []).some((p: string) =>
          p.toLowerCase().includes(q)
        );
        if (!matchEmp && !matchName && !matchEmail && !matchDept && !matchProj) return false;
      }
      return true;
    });
  }, [users, companyFilter, priorityFilter, roleFilter, search]);

  const approverCandidates = useMemo(
    () => users.filter((u) => u.priorityLevel >= 3 || u.roleKey !== "executive"),
    [users]
  );

  function inferReqTypesForUser(u: any): string[] {
    const ep: string[] = u.extraPermissions || [];
    const granular = ep.filter((p) => p.startsWith("req.type."));
    if (granular.length > 0) return granular;

    if (ep.includes("req.mode.company")) return ["req.type.company"];
    if (ep.includes("req.mode.project")) return ["req.type.project"];
    if (ep.includes("req.mode.ops_events")) {
      return ["req.type.company", "req.type.project", "req.type.event"];
    }
    if (ep.includes("req.mode.both")) {
      return ["req.type.company", "req.type.project", "req.type.event"];
    }

    const deptText = [u.departmentName || "", ...(u.secondaryDepartments || [])]
      .join(" ")
      .toLowerCase();
    if ((u.priorityLevel ?? 2) >= 4) {
      return ["req.type.company", "req.type.project", "req.type.event"];
    }
    if (deptText.includes("operation") || deptText.includes("event")) {
      return ["req.type.company", "req.type.project", "req.type.event"];
    }
    if (deptText.includes("project ")) {
      return ["req.type.project"];
    }
    if (u.levelLabel === "Manager" || u.roleKey === "manager" || u.roleKey === "sr_manager") {
      return ["req.type.company", "req.type.project", "req.type.event"];
    }
    if ((u.projectScopeIds?.length ?? 0) > 0) {
      return ["req.type.project"];
    }
    return ["req.type.company"];
  }

  function getAssociatedProjectIdsForUser(u: any): string[] {
    const ep: string[] = u.extraPermissions || [];
    if (ep.includes("report.strict.scope")) {
      return u.projectScopeIds || [];
    }
    const ids = new Set<string>(u.projectScopeIds || []);
    for (const p of projects) {
      if (
        p.headId === u.id ||
        p.checkerId === u.id ||
        p.directorId === u.id
      ) {
        ids.add(p.id);
      }
    }
    return Array.from(ids);
  }

  function inferReportAccessModeForUser(
    u: any
  ): "ASSIGNED_ONLY" | "ALL_REPORTS" | "NONE" {
    const ep: string[] = u.extraPermissions || [];
    if (
      (u.priorityLevel ?? 2) >= 5 ||
      ep.includes("report.view.all") ||
      u.roleKey === "super_admin"
    ) {
      return "ALL_REPORTS";
    }
    if (ep.includes("report.none")) {
      return "NONE";
    }
    if (
      (u.roleKey === "accounts_manager" || u.roleKey === "accounts_executive") &&
      !ep.includes("report.strict.scope")
    ) {
      return "ALL_REPORTS";
    }
    const rolePerms: string[] = u.rolePermissions || [];
    const hasReportPerm =
      ep.includes("report.view") ||
      rolePerms.includes("report.view") ||
      rolePerms.includes("req.director") ||
      rolePerms.includes("req.md") ||
      rolePerms.includes("req.accounts.check") ||
      u.levelLabel === "KAM" ||
      u.levelLabel === "Manager" ||
      u.levelLabel === "Director" ||
      u.levelLabel === "MD";
    return hasReportPerm ? "ASSIGNED_ONLY" : "NONE";
  }

  function inferReportCategoriesForUser(u: any): string[] {
    const ep: string[] = u.extraPermissions || [];
    const cats = ep.filter((p) => p.startsWith("report.scope."));
    if (cats.length > 0) return cats;
    return [
      "report.scope.projects",
      "report.scope.events",
      "report.scope.company",
    ];
  }

  function openCreateUserModal() {
    const execRole = roles.find((r) => r.key === "executive") || roles[0];
    const imsComp = companies.find((c) => c.code === "IMS") || companies[0];
    setSelectedUser(null);
    setEmpId("");
    setName("");
    setEmail("");
    setUserPassword("");
    setDesignation("Executive");
    setPriorityLevel(2);
    setLevelLabel("Executive");
    setRoleId(execRole?.id || "");
    setCompanyId(imsComp?.id || "");
    setDepartmentId(departments[0]?.id || "");
    setNewDepartmentName("");
    setSecondaryDeptsText("");
    setSupervisorId("");
    setBackupApproverId("");
    setCompanyScopeIds(imsComp ? [imsComp.id] : []);
    setProjectScopeIds([]);
    setDirectorCategories([]);
    setExtraPermissions([]);
    setReqTypesAllowed(["req.type.company"]);
    setReportAccessMode("NONE");
    setReportCategories([
      "report.scope.projects",
      "report.scope.events",
      "report.scope.company",
    ]);
    setActive(true);
    setMsg("");
    setErrorMsg("");
    setUserModalTab("PROFILE");
    setModalType("CREATE_USER");
  }

  function openEditUserModal(u: any) {
    setSelectedUser(u);
    setEmpId(u.employeeId || "");
    setName(u.name || "");
    setEmail(u.email || "");
    setUserPassword(""); // Leave blank unless changing
    setDesignation(u.designation || "");
    setPriorityLevel(u.priorityLevel ?? 2);
    setLevelLabel(u.levelLabel || "Executive");
    setRoleId(u.roleId || "");
    setCompanyId(u.companyId || "");
    setDepartmentId(u.departmentId || "");
    setNewDepartmentName("");
    setSecondaryDeptsText((u.secondaryDepartments || []).join(", "));
    setSupervisorId(u.supervisorId || "");
    setBackupApproverId(
      u.backupApproverId || extractBackupApproverId(u.extraPermissions) || ""
    );
    setCompanyScopeIds(u.companyScopeIds || []);
    setProjectScopeIds(getAssociatedProjectIdsForUser(u));
    setDirectorCategories(u.directorCategories || []);
    setExtraPermissions(
      (u.extraPermissions || []).filter(
        (p: string) =>
          !p.startsWith("req.mode.") &&
          !p.startsWith("req.type.") &&
          !p.startsWith("report.scope.") &&
          !p.startsWith(BACKUP_APPROVER_PREFIX) &&
          p !== "report.strict.scope" &&
          p !== "report.none" &&
          p !== "report.view.all"
      )
    );
    setReqTypesAllowed(inferReqTypesForUser(u));
    setReportAccessMode(inferReportAccessModeForUser(u));
    setReportCategories(inferReportCategoriesForUser(u));
    setActive(u.active ?? true);
    setMsg("");
    setErrorMsg("");
    setUserModalTab("PROFILE");
    setModalType("EDIT_USER");
  }

  function openProjectModal(initialMode: "CREATE" | "EDIT" = "CREATE", proj?: any) {
    setMsg("");
    setErrorMsg("");
    setProjMode(initialMode);
    if (initialMode === "EDIT" && proj) {
      setSelectedProjId(proj.id);
      setProjKind(proj.kind === "EVENT" ? "EVENT" : "PERMANENT");
      setProjCompanyId(proj.companyId);
      setProjCode(proj.code);
      setProjName(proj.name);
      setProjCategory(proj.category || "GENERAL");
      setProjHeadId(proj.headId || "");
      setProjDirectorId(proj.directorId || "");
      setProjMemberIds(proj.memberIds || []);
    } else {
      const imsComp = companies.find((c) => c.code === "IMS") || companies[0];
      setSelectedProjId("");
      setProjKind("PERMANENT");
      setProjCompanyId(imsComp?.id || "");
      setProjCode("");
      setProjName("");
      setProjCategory("OUTSOURCING");
      setProjHeadId("");
      setProjDirectorId("");
      setProjMemberIds([]);
    }
    setModalType("PROJECT_MANAGER");
  }

  function handleSelectExistingProjectToEdit(id: string) {
    setSelectedProjId(id);
    const p = projects.find((x) => x.id === id);
    if (p) {
      setProjKind(p.kind === "EVENT" || p.name.toLowerCase().includes("event") ? "EVENT" : "PERMANENT");
      setProjCompanyId(p.companyId);
      setProjCode(p.code);
      setProjName(p.name);
      setProjCategory(p.category || "GENERAL");
      setProjHeadId(p.headId || "");
      setProjDirectorId(p.directorId || "");
      setProjMemberIds(p.memberIds || []);
    }
  }

  function handlePriorityOrLevelChange(newPriority: number, newLevel: string) {
    const effectivePriority =
      newLevel === "KAM" && newPriority < 3 ? 3 : newPriority;
    setPriorityLevel(effectivePriority);
    setLevelLabel(newLevel);
    // Auto-select matching role (KAM stays executive — not Manager/Admin — with assigned-only financial reports)
    let targetKey = "executive";
    if (effectivePriority === 5) targetKey = "super_admin";
    else if (newLevel === "MD") targetKey = "md";
    else if (newLevel === "Director") targetKey = "director";
    else if (newLevel === "KAM") targetKey = "executive";
    else if (newLevel === "Manager" || effectivePriority >= 3)
      targetKey = "manager";
    const foundRole = roles.find((r) => r.key === targetKey);
    if (foundRole) setRoleId(foundRole.id);
    if (effectivePriority === 5) {
      setReportAccessMode("ALL_REPORTS");
    } else if (newLevel === "Executive" && effectivePriority < 3) {
      setReportAccessMode("NONE");
    } else {
      setReportAccessMode("ASSIGNED_ONLY");
    }
    setDesignation((prev) => syncDesignationWithLevel(prev, newLevel));
  }

  function toggleArrayItem(arr: string[], item: string, setter: (val: string[]) => void) {
    if (arr.includes(item)) {
      setter(arr.filter((i) => i !== item));
    } else {
      setter([...arr, item]);
    }
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setUserModalTab("PROFILE");
      setErrorMsg("Please enter both Full Name and Login Email.");
      return;
    }
    setLoading(true);
    setMsg("");
    setErrorMsg("");

    try {
      const isCreate = modalType === "CREATE_USER";
      const reportFlags: string[] = [];
      if (reportAccessMode === "ALL_REPORTS") {
        reportFlags.push("report.view", "report.view.all");
      } else if (reportAccessMode === "NONE") {
        reportFlags.push("report.none");
      } else {
        // ASSIGNED_ONLY — strictly enforce the Super Admin's selected Projects/Events/IMS Group Divisions
        reportFlags.push("report.view", "report.strict.scope");
        const cats =
          reportCategories.length > 0
            ? reportCategories
            : [
                "report.scope.projects",
                "report.scope.events",
                "report.scope.company",
              ];
        reportFlags.push(...cats);
      }

      const payload = {
        id: selectedUser?.id,
        employeeId: empId,
        name,
        email,
        password: userPassword || (isCreate ? email.trim().toLowerCase() : undefined),
        designation,
        priorityLevel,
        levelLabel,
        roleId,
        companyId: companyId || null,
        departmentId: departmentId || null,
        newDepartmentName: newDepartmentName.trim() || undefined,
        secondaryDepartments: secondaryDeptsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        supervisorId: supervisorId || null,
        companyScopeIds,
        projectScopeIds,
        directorCategories,
        extraPermissions: Array.from(
          new Set([
            ...extraPermissions.filter(
              (p) =>
                !p.startsWith("req.mode.") &&
                !p.startsWith("req.type.") &&
                !p.startsWith("report.scope.") &&
                !p.startsWith(BACKUP_APPROVER_PREFIX) &&
                p !== "report.strict.scope" &&
                p !== "report.none" &&
                p !== "report.view.all" &&
                (reportAccessMode !== "NONE" || p !== "report.view")
            ),
            ...(backupApproverId &&
            backupApproverId !== supervisorId &&
            backupApproverId !== selectedUser?.id
              ? [backupApproverPermissionTag(backupApproverId)]
              : []),
            ...(reqTypesAllowed.length > 0 ? reqTypesAllowed : ["req.type.company"]),
            ...reportFlags,
          ])
        ),
        active,
      };

      const res = await fetch("/api/admin/users", {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save user");

      setMsg(
        isCreate
          ? `User "${name}" created! Login Password: ${userPassword || email.trim().toLowerCase()}`
          : `User "${name}" updated successfully!`
      );
      router.refresh();
      setTimeout(() => {
        setModalType(null);
        setMsg("");
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Error saving user");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(u: any) {
    const confirmed = await confirmDialog({
      title: "Delete or Deactivate User",
      message: `Are you sure you want to delete or deactivate "${u.name}" (${u.email})?`,
      confirmLabel: "Confirm",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/users?id=${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove user");
      if (data.deactivated) {
        toast.info(data.message || `User "${u.name}" deactivated.`);
      } else {
        toast.success(`User "${u.name}" removed.`);
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Error removing user");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    setMsg("");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      setMsg(`Password updated to "${newPassword}"!`);
      setTimeout(() => {
        setModalType(null);
        setMsg("");
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProjectOrEvent(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErrorMsg("");
    try {
      const isCreate = projMode === "CREATE";
      const payload = {
        id: isCreate ? undefined : selectedProjId,
        code: projCode.trim().toUpperCase(),
        name: projName.trim(),
        companyId: projCompanyId,
        kind: projKind,
        category: projCategory,
        headId: projHeadId || null,
        directorId: projDirectorId || null,
        memberIds: projMemberIds,
      };

      const res = await fetch("/api/admin/projects", {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save project/event");

      setMsg(
        isCreate
          ? `${projKind === "EVENT" ? "Event" : "Project"} "${projName}" created & team assigned!`
          : `${projKind === "EVENT" ? "Event" : "Project"} "${projName}" updated successfully!`
      );
      router.refresh();
      setTimeout(() => {
        setModalType(null);
        setMsg("");
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Error saving project/event");
    } finally {
      setLoading(false);
    }
  }

  const currentRoleObj = roles.find((r) => r.id === roleId);

  return (
    <div>
      {/* Page Header & Action Bar */}
      <div className="pb-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            User Management, Requisition Priority & Privileges
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Create & edit employees, configure Priority Levels (2–5), assign supervisors, companies (IMS, CLAN, TradePULSE, SCL), projects & events. Default login password = user&apos;s email.
            {isReadOnly && (
              <span className="ml-2 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Read-Only Mode (HR)
              </span>
            )}
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openProjectModal("CREATE")}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-gray-900 text-white hover:bg-gray-800 shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>📁</span> + Add / Rename Project or Event
            </button>
            <button
              type="button"
              onClick={openCreateUserModal}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#E42528] text-white hover:bg-[#B81D20] shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>👤</span> + Add New User / Person
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards by Company & Priority */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-gray-400">Total Users</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">{users.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-purple-600">Priority 5 (Admin)</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">
            {users.filter((u) => u.priorityLevel === 5).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-red-600">Priority 4 (Dir/MD/Sr)</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">
            {users.filter((u) => u.priorityLevel === 4).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-blue-600">Priority 3 (Mgr/Lead)</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">
            {users.filter((u) => u.priorityLevel === 3).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-emerald-600">Priority 2 (Exec)</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">
            {users.filter((u) => u.priorityLevel === 2).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-amber-600">Projects & Events</span>
          <p className="text-lg font-extrabold text-gray-900 mt-0.5">{projects.length}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="mt-4 bg-white p-3 rounded-xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
        <div className="lg:col-span-5 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, name, email, dept, project..."
            className="w-full h-9 pl-3 pr-8 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#E42528]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="lg:col-span-2">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full h-9 px-2.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#E42528]"
          >
            <option value="ALL">All Concerns</option>
            <option value="IMS_GROUP">IMS GROUP</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full h-9 px-2.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#E42528]"
          >
            <option value="ALL">All Priorities</option>
            <option value="5">P5 — Super Admin</option>
            <option value="4">P4 — Director / MD / Sr.</option>
            <option value="3">P3 — Manager / Lead / KAM</option>
            <option value="2">P2 — Executive</option>
          </select>
        </div>

        <div className="lg:col-span-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full h-9 px-2.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#E42528]"
          >
            <option value="ALL">All Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table — Fits cleanly on screen with Sticky Header, Sticky Right Actions & Scroll Slider */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[72vh]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-gray-50 shadow-2xs">
              <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-3">Employee / Login Email</th>
                <th className="py-2.5 px-2.5">Priority & Role</th>
                <th className="py-2.5 px-2.5">Company & Dept</th>
                <th className="py-2.5 px-2.5">Reporting Approver</th>
                <th className="py-2.5 px-2.5">Scopes & Projects</th>
                {!isReadOnly && (
                  <th className="py-2.5 px-3 text-right sticky right-0 bg-gray-50 z-20 border-l border-gray-200">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((u) => {
                const pBadge = PRIORITY_BADGES[u.priorityLevel] || PRIORITY_BADGES[2];
                return (
                  <tr key={u.id} className="hover:bg-gray-50/90 transition-colors group">
                    <td className="py-2.5 px-3 min-w-[180px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {u.employeeId && (
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            #{u.employeeId}
                          </span>
                        )}
                        <span className="font-bold text-gray-900">{u.name}</span>
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            u.active ? "bg-green-500" : "bg-red-500"
                          }`}
                          title={u.active ? "Active" : "Inactive"}
                        />
                      </div>
                      <span className="text-[11px] text-gray-600 font-mono block truncate max-w-[210px]">
                        {u.email}
                      </span>
                      <span className="text-[10px] text-gray-400 block truncate max-w-[210px]">
                        {u.designation}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 max-w-[165px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${pBadge.color}`}
                      >
                        P{u.priorityLevel} • {u.levelLabel}
                      </span>
                      <span className="block text-[10px] text-gray-500 mt-1 font-medium leading-tight">
                        {u.roleName}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 max-w-[165px]">
                      {u.companyName === "IMS GROUP" ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-gray-900 text-white">
                          IMS GROUP
                        </span>
                      ) : (
                        <span className="font-bold text-gray-800">{u.companyName}</span>
                      )}
                      <span className="block text-[11px] text-gray-600 leading-tight mt-0.5">
                        {u.departmentName}
                      </span>
                      {u.secondaryDepartments?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {u.secondaryDepartments.map((sd: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded text-[9px] font-medium border border-gray-200"
                            >
                              +{sd}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 max-w-[190px]">
                      {u.supervisorName ? (
                        <span className="text-[11px] font-semibold text-gray-800 block leading-tight">
                          ↳ {u.supervisorName}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 block">Project / Dept Default</span>
                      )}
                      {u.backupApproverName && (
                        <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1 border border-blue-200 leading-tight font-medium">
                          Backup: {u.backupApproverName}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 max-w-[200px]">
                      {(() => {
                        const rMode = inferReportAccessModeForUser(u);
                        const assocIds = getAssociatedProjectIdsForUser(u);
                        const assocNames = projects
                          .filter((p) => assocIds.includes(p.id))
                          .map((p) => p.name);
                        return (
                          <div className="space-y-1">
                            <div>
                              {rMode === "ALL_REPORTS" ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                  🌐 All Financial Reports
                                </span>
                              ) : rMode === "ASSIGNED_ONLY" ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  🔒 Reports: {assocNames.length} Assigned
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                                  🚫 No Report Access
                                </span>
                              )}
                            </div>
                            {u.companyScopeCodes?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {u.companyScopeCodes.map((code: string) => (
                                  <span
                                    key={code}
                                    className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-[#E42528] border border-red-200"
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}
                            {assocNames.length > 0 ? (
                              <span
                                className="text-[10px] text-gray-600 line-clamp-2 leading-tight block"
                                title={assocNames.join(", ")}
                              >
                                {assocNames.slice(0, 2).join(", ")}
                                {assocNames.length > 2
                                  ? ` +${assocNames.length - 2} more`
                                  : ""}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 block">
                                No specific project/event assigned
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {!isReadOnly && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-gray-50 border-l border-gray-100 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditUserModal(u)}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-2xs cursor-pointer"
                          >
                            Edit & Privileges
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setNewPassword(u.email);
                              setMsg("");
                              setErrorMsg("");
                              setModalType("PASSWORD");
                            }}
                            className="px-2 py-1 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 cursor-pointer"
                            title="Reset Password"
                          >
                            PW
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="px-2 py-1 rounded text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 cursor-pointer"
                            title="Delete or Deactivate User"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-xs">
                    No users match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────── CREATE / EDIT USER & PRIVILEGES MODAL ────────────────── */}
      {(modalType === "CREATE_USER" || modalType === "EDIT_USER") && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-gray-200 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Sticky Header + Tab Switcher */}
            <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {modalType === "CREATE_USER"
                      ? "Add New Employee / User & Configure Privileges"
                      : `Edit User & Privileges — ${selectedUser?.name}`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure identity, approval routing, company scopes, financial reports, and extra privileges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="text-gray-400 hover:text-gray-700 text-lg font-bold px-2 py-0.5 rounded hover:bg-gray-100 cursor-pointer"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {/* 3-Tab Navigation */}
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                {(
                  [
                    { id: "PROFILE", label: "1. Profile & Role" },
                    { id: "ROUTING", label: "2. Approval Routing" },
                    { id: "SCOPES", label: "3. Scopes & Privileges" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setUserModalTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      userModalTab === tab.id
                        ? "bg-gray-900 text-white shadow-xs"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {msg && (
                <div className="mt-3 p-2.5 bg-green-50 border border-green-200 text-xs text-green-800 font-semibold rounded">
                  {msg}
                </div>
              )}
              {errorMsg && (
                <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-700 font-semibold rounded">
                  {errorMsg}
                </div>
              )}
            </div>

            <form
              onSubmit={handleSaveUser}
              className="flex flex-col flex-1 min-h-0 text-xs"
            >
              {/* Scrollable Tab Body */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5">
                {/* ── TAB 1: PROFILE & ROLE ── */}
                <div className={userModalTab === "PROFILE" ? "space-y-5" : "hidden"}>
              {/* Row 1: Identity & Login */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                <div>
                  <label className="block font-semibold text-gray-700">Employee ID</label>
                  <input
                    type="text"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    placeholder="e.g. 1098"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-gray-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Munir Kabir"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700">Designation *</label>
                  <input
                    type="text"
                    required
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Manager, Project Robi"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-gray-700">
                    Email Address (Login ID) *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (modalType === "CREATE_USER") {
                        setUserPassword(e.target.value.toLowerCase().trim());
                      }
                    }}
                    placeholder="name@ims.com.bd"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-gray-700">
                    {modalType === "CREATE_USER"
                      ? "Login Password (Defaults to Email)"
                      : "New Password (leave blank to keep current)"}
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      type="text"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder={
                        modalType === "CREATE_USER"
                          ? email || "Defaults to user's email"
                          : "Leave blank or click 'Use Email'"
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setUserPassword(email.toLowerCase().trim())}
                      className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded whitespace-nowrap cursor-pointer"
                    >
                      Use Email
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Requisition Priority, Level & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-blue-50/40 p-3.5 rounded-lg border border-blue-200">
                <div>
                  <label className="block font-semibold text-gray-800">
                    Requisition Priority Level (Excel 2–5) *
                  </label>
                  <select
                    value={priorityLevel}
                    onChange={(e) =>
                      handlePriorityOrLevelChange(Number(e.target.value), levelLabel)
                    }
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    <option value={2}>Priority 2 — Executive (Maker)</option>
                    <option value={3}>Priority 3 — Manager / Project Lead</option>
                    <option value={4}>Priority 4 — Director / MD / Dept Head</option>
                    <option value={5}>Priority 5 — Super Admin (Full Control)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-800">
                    Hierarchy Level Label *
                  </label>
                  <select
                    value={levelLabel}
                    onChange={(e) =>
                      handlePriorityOrLevelChange(priorityLevel, e.target.value)
                    }
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    <option value="Executive">Executive</option>
                    <option value="KAM">KAM</option>
                    <option value="Manager">Manager</option>
                    <option value="Director">Director</option>
                    <option value="MD">MD (Managing Director)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-800">
                    System Role & Base Permissions *
                  </label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Company, Department & Direct Supervisor */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700">Primary Sister Concern / Group</label>
                  <select
                    value={companyId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCompanyId(val);
                      if (!val) {
                        // IMS GROUP selected -> automatically check all 4 sister concerns (IMS, CLAN, SCL, TP)
                        setCompanyScopeIds(companies.map((c) => c.id));
                      }
                    }}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    <option value="">IMS GROUP (Handles IMS, CLAN, SCL, TradePULSE & All Projects)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.legalName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">Primary Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDepartmentId(val);
                      if (modalType === "CREATE_USER") {
                        const dName = (departments.find((d) => d.id === val)?.name || "").toLowerCase();
                        if (dName.includes("operation") || dName.includes("event")) {
                          setReqTypesAllowed([
                            "req.type.company",
                            "req.type.project",
                            "req.type.event",
                          ]);
                        } else if (dName.includes("project ")) {
                          setReqTypesAllowed(["req.type.project"]);
                        } else if (priorityLevel >= 4 || levelLabel === "Manager") {
                          setReqTypesAllowed([
                            "req.type.company",
                            "req.type.project",
                            "req.type.event",
                          ]);
                        }
                      }
                    }}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  >
                    <option value="">— Select Department —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    placeholder="Or type + New Dept (e.g. Project UPY)"
                    className="mt-1.5 w-full px-2.5 py-1 border border-dashed border-gray-300 rounded text-[11px]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">
                    Secondary Depts / Teams (Dept 2, Dept 3)
                  </label>
                  <input
                    type="text"
                    value={secondaryDeptsText}
                    onChange={(e) => setSecondaryDeptsText(e.target.value)}
                    placeholder="e.g. TradePulse, Events projects"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  />
                  <span className="text-[10px] text-gray-400">Comma-separated secondary units</span>
                </div>
              </div>
                </div>

                {/* ── TAB 2: APPROVAL ROUTING ── */}
                <div className={userModalTab === "ROUTING" ? "space-y-5" : "hidden"}>
              {/* Row 3B: Choose Requisition Type Access (3 Separate Options: Company, Project, Event) */}
              <div className="border border-slate-200 bg-slate-50/70 rounded-lg p-3.5">
                <div className="mb-2">
                  <label className="font-bold text-gray-900 block">
                    Choose Requisition Type Access (On &ldquo;New Requisition&rdquo; Form) *
                  </label>
                  <p className="text-[10px] text-gray-500">
                    Select which of the 3 separate requisition types this user is allowed to submit (check one or more).
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      key: "req.type.company",
                      title: "🏢 IMS Group Company",
                      desc: "Sister Concern (IMS / CLAN / SCL / TradePULSE) & Department requisitions.",
                    },
                    {
                      key: "req.type.project",
                      title: "📁 Project Requisition",
                      desc: "Projects only (Project Robi, GP, UPY, Singer, BAT CE, Unilever, BeHereNow, etc.).",
                    },
                    {
                      key: "req.type.event",
                      title: "🎪 Event Requisition",
                      desc: "Events only (Event — Banglalink, GP Events, Bkash, BAT Events, etc.).",
                    },
                  ].map((opt) => {
                    const selected = reqTypesAllowed.includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          selected
                            ? "bg-red-50/80 border-[#E42528] ring-1 ring-[#E42528]"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleArrayItem(reqTypesAllowed, opt.key, setReqTypesAllowed)
                          }
                          className="mt-0.5 accent-[#E42528]"
                        />
                        <div>
                          <div className="text-xs font-bold text-gray-900">{opt.title}</div>
                          <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                            {opt.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Reporting Approver, Backup / Alternate Approver & Live Effective Chain Preview */}
              <div className="bg-amber-50/40 p-3.5 rounded-lg border border-amber-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-800">
                      Direct Reporting Approver (Primary Head / Checked By)
                    </label>
                    <select
                      value={supervisorId}
                      onChange={(e) => {
                        const nextSup = e.target.value;
                        setSupervisorId(nextSup);
                        if (nextSup && nextSup === backupApproverId) {
                          setBackupApproverId("");
                        }
                      }}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                    >
                      <option value="">— Use Project / Department Default Head —</option>
                      {approverCandidates
                        .filter((cand) => cand.id !== selectedUser?.id)
                        .map((cand) => (
                          <option key={cand.id} value={cand.id}>
                            {cand.employeeId ? `[${cand.employeeId}] ` : ""}
                            {cand.name} — {cand.designation} (P{cand.priorityLevel})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-800">
                      Backup / Alternate Approver (Optional)
                    </label>
                    <select
                      value={backupApproverId}
                      onChange={(e) => setBackupApproverId(e.target.value)}
                      className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                    >
                      <option value="">— None (Primary Approver Only) —</option>
                      {approverCandidates
                        .filter(
                          (cand) =>
                            cand.id !== selectedUser?.id && cand.id !== supervisorId
                        )
                        .map((cand) => (
                          <option key={cand.id} value={cand.id}>
                            {cand.employeeId ? `[${cand.employeeId}] ` : ""}
                            {cand.name} — {cand.designation} (P{cand.priorityLevel})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Live Effective Approval Path Preview */}
                {(() => {
                  const selectedRole = roles.find((r) => r.id === roleId);
                  const rolePerms: string[] = selectedRole?.permissions || [];
                  const isMgr = Boolean(selectedRole?.isManager);
                  const isMdRole = selectedRole?.key === "md" || rolePerms.includes("req.md");
                  const isDirRole = rolePerms.includes("req.director");
                  const isAccountsCheck = rolePerms.includes("req.accounts.check");
                  const primaryUser = users.find((x) => x.id === supervisorId);
                  const backupUser = users.find((x) => x.id === backupApproverId);

                  const steps: Array<{ label: string; tone: string }> = [
                    { label: name.trim() || "This User", tone: "bg-gray-900 text-white" },
                  ];

                  if (!isMgr && !isMdRole) {
                    const primaryLabel = primaryUser
                      ? `${primaryUser.employeeId ? `[${primaryUser.employeeId}] ` : ""}${primaryUser.name}`
                      : "Project / Dept Head";
                    const backupLabel = backupUser
                      ? ` or ${backupUser.employeeId ? `[${backupUser.employeeId}] ` : ""}${backupUser.name}`
                      : "";
                    steps.push({
                      label: `Head: ${primaryLabel}${backupLabel}`,
                      tone: "bg-blue-50 text-blue-800 border border-blue-200",
                    });
                  }

                  if (!isAccountsCheck) {
                    steps.push({
                      label: "Accounts Check",
                      tone: "bg-indigo-50 text-indigo-800 border border-indigo-200",
                    });
                  }

                  if (!isDirRole) {
                    steps.push({
                      label: "Director",
                      tone: "bg-purple-50 text-purple-800 border border-purple-200",
                    });
                  }

                  if (!isMdRole) {
                    steps.push({
                      label: "Managing Director",
                      tone: "bg-red-50 text-[#E42528] border border-red-200",
                    });
                  }

                  steps.push({
                    label: "Accounts Disburse",
                    tone: "bg-emerald-50 text-emerald-800 border border-emerald-200",
                  });

                  return (
                    <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px] mr-1">
                        Effective Path:
                      </span>
                      {steps.map((st, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded font-semibold ${st.tone}`}>
                            {st.label}
                          </span>
                          {idx < steps.length - 1 && (
                            <span className="text-gray-400 font-bold">→</span>
                          )}
                        </span>
                      ))}
                      {isMgr && !isMdRole && (
                        <span className="text-[10px] text-amber-800 ml-1">
                          (Manager role skips Head step)
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
                </div>

                {/* ── TAB 3: SCOPES & PRIVILEGES ── */}
                <div className={userModalTab === "SCOPES" ? "space-y-5" : "hidden"}>
              {/* Row 5: Company Scopes (IMS, CLAN, TradePULSE, SCL) */}
              <div className="border border-gray-200 rounded-lg p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-gray-800">
                    Allowed Sister Concerns (Company Scopes)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCompanyScopeIds(companies.map((c) => c.id))}
                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    Select All 4 Companies
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {companies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                        companyScopeIds.includes(c.id)
                          ? "bg-red-50 border-red-300 font-bold text-gray-900"
                          : "bg-white border-gray-200 text-gray-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={companyScopeIds.includes(c.id)}
                        onChange={() =>
                          toggleArrayItem(companyScopeIds, c.id, setCompanyScopeIds)
                        }
                      />
                      <span>
                        {c.name} <span className="text-[10px] text-gray-400">({c.code})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Row 6: Super Admin Financial Reports & Assigned Projects / Events / IMS Group Control */}
              <div className="border-2 border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="font-bold text-gray-900 text-xs block">
                      💹 Financial Reports &amp; P&amp;L Access Rights (Super Admin Control)
                    </label>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Control whether this user (MD, Director, Group Head, Manager, or Executive) can view Financial Reports and restrict them strictly to the Projects, Events, or IMS Group Divisions checked below.
                    </p>
                  </div>
                </div>

                {/* 6.1 Report Access Mode Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      mode: "ASSIGNED_ONLY" as const,
                      title: "🔒 Assigned Scope Only (Recommended)",
                      desc: "Can ONLY view Financial Reports for the specific Projects, Events, or IMS Group Divisions checked below.",
                    },
                    {
                      mode: "ALL_REPORTS" as const,
                      title: "🌐 Full Unrestricted Report Access",
                      desc: "Can view Financial Reports across ALL Projects, Events, and IMS Group Divisions.",
                    },
                    {
                      mode: "NONE" as const,
                      title: "🚫 No Financial Reports Access",
                      desc: "Hides Financial Reports (/finance & /reports) completely for this user.",
                    },
                  ].map((opt) => {
                    const activeMode = reportAccessMode === opt.mode;
                    return (
                      <label
                        key={opt.mode}
                        onClick={() => setReportAccessMode(opt.mode)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          activeMode
                            ? "bg-indigo-50 border-indigo-600 ring-1 ring-indigo-600"
                            : "bg-white border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="reportAccessMode"
                          checked={activeMode}
                          onChange={() => setReportAccessMode(opt.mode)}
                          className="mt-0.5 accent-indigo-600"
                        />
                        <div>
                          <div className="text-xs font-bold text-gray-900">
                            {opt.title}
                          </div>
                          <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                            {opt.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* 6.2 Allowed Report Categories (when report access is enabled) */}
                {reportAccessMode !== "NONE" && (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-indigo-100">
                    <span className="text-[11px] font-bold text-gray-800">
                      Permitted Report Sections:
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      {[
                        {
                          key: "report.scope.projects",
                          label: "📁 Projects P&L Reports",
                        },
                        {
                          key: "report.scope.events",
                          label: "🎪 Events P&L Reports",
                        },
                        {
                          key: "report.scope.company",
                          label: "🏢 IMS Group Expense Reports",
                        },
                      ].map((cat) => (
                        <label
                          key={cat.key}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={reportCategories.includes(cat.key)}
                            onChange={() =>
                              toggleArrayItem(
                                reportCategories,
                                cat.key,
                                setReportCategories
                              )
                            }
                            className="accent-indigo-600"
                          />
                          <span>{cat.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6.3 3-Column Selector: Assigned Projects | Assigned Events | Assigned IMS Group Divisions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 6A: Assigned Projects ONLY */}
                  {(() => {
                    const projectItems = projects.filter(
                      (p) =>
                        p.kind !== "EVENT" &&
                        !p.code?.toUpperCase().startsWith("EVT-") &&
                        ![
                          "IMS-HO",
                          "IMS-IT",
                          "IMS-STUDIO",
                          "IMS-BD-BLUE",
                          "IMS-BD-RED",
                          "CLAN-MAIN",
                          "SCL-MAIN",
                          "TP-OPS",
                        ].includes(p.code)
                    );
                    const allIds = projectItems.map((p) => p.id);
                    return (
                      <div className="border border-gray-200 bg-white rounded-lg p-3">
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div>
                            <label className="font-bold text-gray-800 block">
                              📁 Assigned Projects ({projectItems.filter((p) => projectScopeIds.includes(p.id)).length}/{projectItems.length})
                            </label>
                            <p className="text-[10px] text-gray-500">
                              Client Projects (Robi, UBL, Nagad, etc.)
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  Array.from(new Set([...projectScopeIds, ...allIds]))
                                )
                              }
                              className="text-blue-600 hover:underline font-semibold cursor-pointer"
                            >
                              All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  projectScopeIds.filter((id) => !allIds.includes(id))
                                )
                              }
                              className="text-gray-500 hover:underline font-semibold cursor-pointer"
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto p-1 bg-gray-50 rounded border border-gray-200">
                          {projectItems.map((p) => {
                            const isHead = selectedUser?.id && p.headId === selectedUser.id;
                            const isChecker = selectedUser?.id && p.checkerId === selectedUser.id;
                            const isDir = selectedUser?.id && p.directorId === selectedUser.id;
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                                  projectScopeIds.includes(p.id)
                                    ? "bg-red-50 border-red-300 font-semibold text-gray-900"
                                    : "bg-white border-gray-200 text-gray-700"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <input
                                    type="checkbox"
                                    checked={projectScopeIds.includes(p.id)}
                                    onChange={() =>
                                      toggleArrayItem(
                                        projectScopeIds,
                                        p.id,
                                        setProjectScopeIds
                                      )
                                    }
                                  />
                                  <span className="truncate">
                                    <span className="font-mono text-[10px] text-gray-400 mr-1">
                                      [{p.code}]
                                    </span>
                                    {p.name}
                                  </span>
                                </div>
                                {(isHead || isChecker || isDir) && (
                                  <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0">
                                    {isHead ? "Head" : isChecker ? "Checker" : "Director"}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 6B: Assigned Events ONLY */}
                  {(() => {
                    const eventItems = projects.filter(
                      (p) =>
                        p.kind === "EVENT" || p.code?.toUpperCase().startsWith("EVT-")
                    );
                    const allIds = eventItems.map((p) => p.id);
                    return (
                      <div className="border border-gray-200 bg-white rounded-lg p-3">
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div>
                            <label className="font-bold text-gray-800 block">
                              🎪 Assigned Events ({eventItems.filter((p) => projectScopeIds.includes(p.id)).length}/{eventItems.length})
                            </label>
                            <p className="text-[10px] text-gray-500">
                              Events (BL, GP, Bkash, BAT, General)
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  Array.from(new Set([...projectScopeIds, ...allIds]))
                                )
                              }
                              className="text-blue-600 hover:underline font-semibold cursor-pointer"
                            >
                              All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  projectScopeIds.filter((id) => !allIds.includes(id))
                                )
                              }
                              className="text-gray-500 hover:underline font-semibold cursor-pointer"
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto p-1 bg-gray-50 rounded border border-gray-200">
                          {eventItems.map((p) => {
                            const isHead = selectedUser?.id && p.headId === selectedUser.id;
                            const isChecker = selectedUser?.id && p.checkerId === selectedUser.id;
                            const isDir = selectedUser?.id && p.directorId === selectedUser.id;
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                                  projectScopeIds.includes(p.id)
                                    ? "bg-blue-50 border-blue-300 font-semibold text-blue-900"
                                    : "bg-white border-gray-200 text-gray-700"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <input
                                    type="checkbox"
                                    checked={projectScopeIds.includes(p.id)}
                                    onChange={() =>
                                      toggleArrayItem(
                                        projectScopeIds,
                                        p.id,
                                        setProjectScopeIds
                                      )
                                    }
                                  />
                                  <span className="truncate">
                                    <span className="font-mono text-[10px] text-gray-400 mr-1">
                                      [{p.code}]
                                    </span>
                                    {p.name}
                                  </span>
                                </div>
                                {(isHead || isChecker || isDir) && (
                                  <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0">
                                    {isHead ? "Head" : isChecker ? "Checker" : "Director"}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 6C: Assigned IMS Group Divisions ONLY */}
                  {(() => {
                    const divisionItems = projects.filter((p) =>
                      [
                        "IMS-HO",
                        "IMS-IT",
                        "IMS-STUDIO",
                        "IMS-BD-BLUE",
                        "IMS-BD-RED",
                        "CLAN-MAIN",
                        "SCL-MAIN",
                        "TP-OPS",
                      ].includes(p.code)
                    );
                    const allIds = divisionItems.map((p) => p.id);
                    return (
                      <div className="border border-gray-200 bg-white rounded-lg p-3">
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div>
                            <label className="font-bold text-gray-800 block">
                              🏢 Assigned IMS Group ({divisionItems.filter((p) => projectScopeIds.includes(p.id)).length}/{divisionItems.length})
                            </label>
                            <p className="text-[10px] text-gray-500">
                              Internal Divisions (HO, Studio, BD, CLAN, SCL, TP)
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  Array.from(new Set([...projectScopeIds, ...allIds]))
                                )
                              }
                              className="text-blue-600 hover:underline font-semibold cursor-pointer"
                            >
                              All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProjectScopeIds(
                                  projectScopeIds.filter((id) => !allIds.includes(id))
                                )
                              }
                              className="text-gray-500 hover:underline font-semibold cursor-pointer"
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto p-1 bg-gray-50 rounded border border-gray-200">
                          {divisionItems.map((p) => {
                            const isHead = selectedUser?.id && p.headId === selectedUser.id;
                            const isChecker = selectedUser?.id && p.checkerId === selectedUser.id;
                            const isDir = selectedUser?.id && p.directorId === selectedUser.id;
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                                  projectScopeIds.includes(p.id)
                                    ? "bg-rose-50 border-rose-300 font-semibold text-rose-900"
                                    : "bg-white border-gray-200 text-gray-700"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <input
                                    type="checkbox"
                                    checked={projectScopeIds.includes(p.id)}
                                    onChange={() =>
                                      toggleArrayItem(
                                        projectScopeIds,
                                        p.id,
                                        setProjectScopeIds
                                      )
                                    }
                                  />
                                  <span className="truncate">
                                    <span className="font-mono text-[10px] text-gray-400 mr-1">
                                      [{p.code}]
                                    </span>
                                    {p.name}
                                  </span>
                                </div>
                                {(isHead || isChecker || isDir) && (
                                  <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0">
                                    {isHead ? "Head" : isChecker ? "Checker" : "Director"}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Row 7: Director Categories & Granular Extra Privileges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border border-gray-200 rounded-lg p-3">
                  <label className="font-bold text-gray-800 block mb-1.5">
                    Director Approval Categories (For Directors)
                  </label>
                  <div className="space-y-1">
                    {CATEGORIES.map((cat) => (
                      <label key={cat.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={directorCategories.includes(cat.key)}
                          onChange={() =>
                            toggleArrayItem(
                              directorCategories,
                              cat.key,
                              setDirectorCategories
                            )
                          }
                        />
                        <span>{cat.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-3">
                  <label className="font-bold text-gray-800 block mb-1">
                    Extra User Privileges (in addition to Role)
                  </label>
                  <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-1">
                    {(Object.entries(PERMISSION_LABELS) as [Permission, string][]).map(
                      ([permKey, label]) => {
                        const isProjectPerm =
                          permKey === "project.view" || permKey === "project.manage";
                        const fromRole = isProjectPerm
                          ? priorityLevel >= 4
                          : Boolean(currentRoleObj?.permissions?.includes(permKey));
                        const checked = fromRole || extraPermissions.includes(permKey);
                        return (
                          <label
                            key={permKey}
                            className={`flex items-center gap-2 text-[11px] ${
                              fromRole ? "text-gray-400" : "text-gray-700 cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={fromRole}
                              checked={checked}
                              onChange={() =>
                                toggleArrayItem(
                                  extraPermissions,
                                  permKey,
                                  setExtraPermissions
                                )
                              }
                            />
                            <span>
                              {label}{" "}
                              {fromRole && (
                                <span className="text-[9px] bg-gray-100 px-1 rounded">
                                  {isProjectPerm ? "via P4/P5" : "via Role"}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-5 sm:px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <label className="flex items-center gap-2 font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span>Account Active (Allowed to Sign In)</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-lg shadow cursor-pointer disabled:opacity-50"
                  >
                    {loading
                      ? "Saving..."
                      : modalType === "CREATE_USER"
                      ? "Create User & Set Privileges"
                      : "Save User & Privileges"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── QUICK PROJECT / EVENT CREATOR & RENAMER MODAL ────────────────── */}
      {modalType === "PROJECT_MANAGER" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-gray-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Manage Specific Projects & Events (IMS / CLAN / TradePULSE / SCL)
                </h3>
                <p className="text-xs text-gray-500">
                  Add a new Project (e.g. Robi, UPY, GP) or Event (e.g. Banglalink, GP, Bkash), rename any existing project/event, and assign its Executive & Manager.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => openProjectModal("CREATE")}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                  projMode === "CREATE"
                    ? "bg-[#E42528] text-white border-[#E42528]"
                    : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                + Create New Project or Event
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjMode("EDIT");
                  if (projects[0]) handleSelectExistingProjectToEdit(projects[0].id);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                  projMode === "EDIT"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                ✎ Rename / Reassign Existing Project or Event
              </button>
            </div>

            {msg && (
              <div className="mt-3 p-2.5 bg-green-50 border border-green-200 text-xs text-green-800 font-semibold rounded">
                {msg}
              </div>
            )}
            {errorMsg && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-xs text-red-700 font-semibold rounded">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveProjectOrEvent} className="mt-4 space-y-4 text-xs">
              {projMode === "EDIT" && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <label className="block font-bold text-amber-900">
                    Select Existing Project or Event to Rename / Update
                  </label>
                  <select
                    value={selectedProjId}
                    onChange={(e) => handleSelectExistingProjectToEdit(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 border border-amber-300 rounded bg-white font-semibold"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.companyCode}] {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700">Type *</label>
                  <select
                    value={projKind}
                    onChange={(e) => {
                      const k = e.target.value as "PERMANENT" | "EVENT";
                      setProjKind(k);
                      if (k === "EVENT") setProjCategory("OPERATIONS_EVENT");
                    }}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    <option value="PERMANENT">Ongoing Project (e.g. Robi, UPY, GP, Singer)</option>
                    <option value="EVENT">Event Activation (e.g. Banglalink, GP, Bkash)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">Sister Concern *</label>
                  <select
                    value={projCompanyId}
                    onChange={(e) => setProjCompanyId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-semibold"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.legalName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">
                    Specific Project / Event Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={projName}
                    onChange={(e) => {
                      setProjName(e.target.value);
                      if (projMode === "CREATE" && !projCode) {
                        const slug = e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                          .slice(0, 14);
                        setProjCode(slug);
                      }
                    }}
                    placeholder={
                      projKind === "EVENT"
                        ? "e.g. Event - Banglalink / Event - Bkash"
                        : "e.g. Project Robi / Project UPY / Project GP"
                    }
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">Project / Event Code *</label>
                  <input
                    type="text"
                    required
                    value={projCode}
                    onChange={(e) => setProjCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PROJ-ROBI or EVT-BKASH"
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">
                    Assigned Manager (Checked By Head)
                  </label>
                  <select
                    value={projHeadId}
                    onChange={(e) => setProjHeadId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  >
                    <option value="">— Select Project / Event Manager —</option>
                    {approverCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.employeeId ? `[${u.employeeId}] ` : ""}
                        {u.name} ({u.designation})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700">Assigned Director</label>
                  <select
                    value={projDirectorId}
                    onChange={(e) => setProjDirectorId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                  >
                    <option value="">— Category Default Director —</option>
                    {users
                      .filter((u) => u.roleKey === "director" || u.priorityLevel >= 4)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.employeeId ? `[${u.employeeId}] ` : ""}
                          {u.name} ({u.designation})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Assign Executives & Team Members */}
              <div className="border border-gray-200 rounded-lg p-3">
                <label className="font-bold text-gray-800 block mb-1.5">
                  Assign Executives & Managers to this {projKind === "EVENT" ? "Event" : "Project"} ({projMemberIds.length} selected)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-1 bg-gray-50 rounded border border-gray-200">
                  {users.map((u) => (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        projMemberIds.includes(u.id)
                          ? "bg-blue-50 border-blue-300 font-semibold text-blue-900"
                          : "bg-white border-gray-200 text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={projMemberIds.includes(u.id)}
                        onChange={() =>
                          toggleArrayItem(projMemberIds, u.id, setProjMemberIds)
                        }
                      />
                      <span className="truncate">
                        {u.employeeId ? `#${u.employeeId} ` : ""}
                        {u.name}{" "}
                        <span className="text-[10px] text-gray-400">({u.departmentName})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-lg shadow cursor-pointer disabled:opacity-50"
                >
                  {loading
                    ? "Saving..."
                    : projMode === "CREATE"
                    ? `Create ${projKind === "EVENT" ? "Event" : "Project"}`
                    : `Save ${projKind === "EVENT" ? "Event" : "Project"} Changes`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── PASSWORD RESET MODAL ────────────────── */}
      {modalType === "PASSWORD" && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">
              Reset Password for {selectedUser.name}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Default policy: use the employee&apos;s email address ({selectedUser.email}) as their login password.
            </p>

            {msg && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 text-xs text-green-800 rounded">
                {msg}
              </div>
            )}
            {errorMsg && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">New Password</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPassword(selectedUser.email)}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-[11px] font-semibold rounded border border-gray-300 whitespace-nowrap cursor-pointer"
                  >
                    Use Email
                  </button>
                </div>
              </div>

              <div className="mt-5 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Resetting..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
