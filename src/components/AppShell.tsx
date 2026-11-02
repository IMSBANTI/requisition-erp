import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar, { MobileMenuTrigger } from "./Sidebar";
import NotificationBell from "./NotificationBell";
import Link from "next/link";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Calculate pending signatures count for this user
  let pendingCount = 0;
  let batchCount = 0;

  if (user.permissions.includes("req.approve") || user.permissions.includes("req.director")) {
    pendingCount += await prisma.requisition.count({
      where: { currentAssigneeId: user.id },
    });
  }
  if (user.permissions.includes("req.accounts.check")) {
    pendingCount += await prisma.requisition.count({
      where: { status: "PENDING_ACCOUNTS" },
    });
  }
  if (user.permissions.includes("req.md")) {
    pendingCount += await prisma.requisition.count({
      where: { status: "PENDING_MD" },
    });
    batchCount = await prisma.requisition.count({
      where: { mdStatus: "PENDING_BATCH" },
    });
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <div className="no-print">
        <Sidebar user={user} pendingCount={pendingCount} batchCount={batchCount} />
      </div>
      <main className="flex-1 min-w-0 overflow-x-hidden min-h-screen flex flex-col pb-20 md:pb-0">
        {/* Global Top Bar */}
        <header className="no-print bg-white border-b border-gray-200 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sticky top-0 z-30">
          <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs text-gray-500 font-medium min-w-0">
            <MobileMenuTrigger />
            <span className="font-bold text-gray-900 tracking-tight whitespace-nowrap">
              IMS GROUP
            </span>
            <span className="hidden sm:inline">&bull;</span>
            <span className="hidden sm:inline text-gray-700 font-semibold truncate">
              {user.company?.name || "IMS GROUP (IMS • CLAN • SCL • TradePULSE)"}
            </span>
            {user.department && (
              <>
                <span className="hidden lg:inline">&bull;</span>
                <span className="hidden lg:inline text-gray-500 truncate">
                  {user.department.name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* Live Notification Bell */}
            <NotificationBell />

            {/* Quick Profile Pill */}
            <Link
              href="/profile"
              className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-2.5 py-1 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              <div className="w-5 h-5 rounded-full bg-[#E42528] text-white flex items-center justify-center text-[10px] font-black shrink-0">
                {user.name.charAt(0)}
              </div>
              <span className="text-xs font-semibold text-gray-800 truncate max-w-[90px] sm:max-w-none">
                {user.name}
              </span>
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
