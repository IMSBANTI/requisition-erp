"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  user: {
    name: string;
    designation: string;
    role: { name: string; key: string; isManager?: boolean };
    permissions: string[];
    company?: { name: string; code: string } | null;
  };
  pendingCount?: number;
  batchCount?: number;
}

export default function Sidebar({ user, pendingCount = 0, batchCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const perms = user.permissions;

  const links = [
    { href: "/", label: "Dashboard", icon: "📊" },
    { href: "/requisitions", label: "All Requisitions", icon: "📋" },
    { href: "/requisitions/new", label: "New Requisition", icon: "➕" },
  ];

  if (perms.includes("req.approve") || perms.includes("req.accounts.check") || perms.includes("req.director") || perms.includes("req.md")) {
    links.push({
      href: "/requisitions?filter=pending",
      label: `Pending Signatures ${pendingCount > 0 ? `(${pendingCount})` : ""}`,
      icon: "✍️",
    });
  }

  if (perms.includes("req.md")) {
    links.push({
      href: "/md/batch",
      label: `MD Batch Queue ${batchCount > 0 ? `(${batchCount})` : ""}`,
      icon: "⚡",
    });
  }

  if (perms.includes("req.execute")) {
    links.push({
      href: "/requisitions?filter=to_execute",
      label: "To Execute / Disburse",
      icon: "💰",
    });
  }

  links.push({ href: "/print/blank", label: "Print Blank Form", icon: "🖨️" });

  const canViewReports =
    perms.includes("report.view") ||
    perms.includes("admin.users") ||
    perms.includes("admin.readonly") ||
    perms.includes("req.director") ||
    perms.includes("req.md") ||
    perms.includes("req.accounts.check") ||
    Boolean(user.role.isManager) ||
    user.role.key.includes("manager");

  if (canViewReports) {
    links.push({
      href: "/reports",
      label: "Query & Custom Reports",
      icon: "📈",
    });
  }

  const isAdmin = perms.includes("admin.users") || perms.includes("admin.readonly");
  const canManageProjects = perms.includes("project.manage");

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-200 flex items-center space-x-3">
        <img src="/logos/ims.png" alt="IMS Group" className="h-10 w-auto object-contain" />
        <div>
          <h1 className="font-bold text-gray-900 text-sm tracking-tight leading-tight">IMS GROUP</h1>
          <p className="text-[11px] text-gray-500 font-medium">Requisition Approval ERP</p>
        </div>
      </div>

      {/* User Scope Card */}
      <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
        <p className="text-[11px] text-gray-500 truncate">{user.designation}</p>
        <div className="mt-1 flex items-center space-x-1.5">
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-[#E42528] rounded border border-red-200">
            {user.role.name}
          </span>
          {user.company && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-700 rounded border border-gray-200">
              {user.company.code}
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">
          Requisitions
        </div>
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href.includes("filter") && pathname.startsWith("/requisitions"));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-red-50 text-[#E42528] font-semibold"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="mr-2.5 text-sm">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}

        {(isAdmin || canManageProjects) && (
          <>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 mt-6 mb-1">
              Administration
            </div>
            {isAdmin && (
              <Link
                href="/admin/users"
                className={`flex items-center px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                  pathname.startsWith("/admin/users")
                    ? "bg-red-50 text-[#E42528] font-semibold"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="mr-2.5 text-sm">👥</span>
                Users & Roles
              </Link>
            )}
            {canManageProjects && (
              <Link
                href="/admin/projects"
                className={`flex items-center px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                  pathname.startsWith("/admin/projects")
                    ? "bg-red-50 text-[#E42528] font-semibold"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="mr-2.5 text-sm">📁</span>
                Projects & Workflows
              </Link>
            )}
            {perms.includes("audit.view") && (
              <Link
                href="/admin/audit"
                className={`flex items-center px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                  pathname.startsWith("/admin/audit")
                    ? "bg-red-50 text-[#E42528] font-semibold"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="mr-2.5 text-sm">📜</span>
                Audit Trail
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Footer Profile & Logout */}
      <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <Link
          href="/profile"
          className="flex items-center text-xs font-medium text-gray-700 hover:text-[#E42528]"
        >
          <span className="mr-1.5 text-sm">⚙️</span>
          Signature & PIN
        </Link>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch("/api/auth/logout", {
                method: "POST",
                headers: { Accept: "application/json" },
              });
            } catch (_) {}
            window.location.href = "/login";
          }}
          className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
