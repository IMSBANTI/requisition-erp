"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileMenuTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"))}
      className="md:hidden p-1.5 -ml-1 mr-1 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
      aria-label="Open Navigation Menu"
    >
      <span className="text-lg leading-none font-bold">☰</span>
    </button>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const perms = user.permissions;

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Listen for custom toggle event from top header hamburger button
  useEffect(() => {
    const handleToggle = () => setMobileOpen((prev) => !prev);
    window.addEventListener("toggle-mobile-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-mobile-sidebar", handleToggle);
  }, []);

  const links = [
    { href: "/", label: "Dashboard", icon: "📊" },
    { href: "/requisitions", label: "All Requisitions", icon: "📋" },
    { href: "/requisitions/new", label: "New Requisition", icon: "➕" },
  ];

  const canSignOrCheck =
    perms.includes("req.approve") ||
    perms.includes("req.accounts.check") ||
    perms.includes("req.director") ||
    perms.includes("req.md");

  if (canSignOrCheck) {
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
      href: "/finance",
      label: "Project & Event P&L",
      icon: "💹",
    });
    links.push({
      href: "/reports",
      label: "Query & Custom Reports",
      icon: "📈",
    });
  }

  const isAdmin = perms.includes("admin.users") || perms.includes("admin.readonly");
  const canManageProjects = perms.includes("project.manage") || perms.includes("project.view");

  const sidebarContent = (
    <>
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src="/logos/ims.png" alt="IMS Group" className="h-10 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-gray-900 text-sm tracking-tight leading-tight">IMS GROUP</h1>
            <p className="text-[11px] text-gray-500 font-medium">Requisition Approval ERP</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 text-lg leading-none cursor-pointer"
          aria-label="Close Menu"
        >
          ✕
        </button>
      </div>

      {/* User Scope Card */}
      <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
        <p className="text-[11px] text-gray-500 truncate">{user.designation}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-[#E42528] rounded border border-red-200">
            {user.role.name}
          </span>
          {user.company ? (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-700 rounded border border-gray-200">
              {user.company.code}
            </span>
          ) : (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-gray-900 text-white rounded">
              IMS GROUP
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
          const isActive =
            pathname === link.href ||
            (link.href.includes("filter") && pathname.startsWith("/requisitions"));
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center px-3 py-2.5 md:py-2 text-xs font-medium rounded-md transition-colors ${
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
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-2.5 md:py-2 text-xs font-medium rounded-md transition-colors ${
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
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-2.5 md:py-2 text-xs font-medium rounded-md transition-colors ${
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
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-2.5 md:py-2 text-xs font-medium rounded-md transition-colors ${
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
          onClick={() => setMobileOpen(false)}
          className="flex items-center text-xs font-medium text-gray-700 hover:text-[#E42528]"
        >
          <span className="mr-1.5 text-sm">🔑</span>
          Password &amp; Profile
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
    </>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0 min-h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] flex items-center justify-around py-1.5 px-1">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
            pathname === "/" ? "text-[#E42528]" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <span className="text-base leading-none mb-0.5">📊</span>
          <span>Home</span>
        </Link>

        <Link
          href="/requisitions"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
            pathname === "/requisitions" ? "text-[#E42528]" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <span className="text-base leading-none mb-0.5">📋</span>
          <span>Requisitions</span>
        </Link>

        <Link
          href="/requisitions/new"
          className="flex flex-col items-center justify-center -mt-3 bg-[#E42528] text-white rounded-full w-11 h-11 shadow-md border-2 border-white"
          title="New Requisition"
        >
          <span className="text-base leading-none font-bold">➕</span>
          <span className="text-[8px] font-bold leading-none mt-0.5">New</span>
        </Link>

        {canSignOrCheck ? (
          <Link
            href="/requisitions?filter=pending"
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
              pathname.startsWith("/requisitions") ? "text-gray-700" : "text-gray-600"
            }`}
          >
            <span className="text-base leading-none mb-0.5">✍️</span>
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="absolute top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#E42528] text-white text-[9px] font-extrabold flex items-center justify-center">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </Link>
        ) : canViewReports ? (
          <Link
            href="/finance"
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
              pathname.startsWith("/finance") ? "text-[#E42528]" : "text-gray-600"
            }`}
          >
            <span className="text-base leading-none mb-0.5">💹</span>
            <span>P&amp;L</span>
          </Link>
        ) : (
          <Link
            href="/profile"
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
              pathname.startsWith("/profile") ? "text-[#E42528]" : "text-gray-600"
            }`}
          >
            <span className="text-base leading-none mb-0.5">🔑</span>
            <span>Profile</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
        >
          <span className="text-base leading-none mb-0.5">☰</span>
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
