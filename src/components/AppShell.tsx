import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar from "./Sidebar";
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
      <main className="flex-1 overflow-x-hidden min-h-screen flex flex-col">
        {/* Global Top Bar */}
        <header className="no-print bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-2 text-xs text-gray-500 font-medium">
            <span className="font-bold text-gray-900 tracking-tight">IMS GROUP</span>
            <span>&bull;</span>
            <span className="text-gray-700 font-semibold">{user.company?.name || "Group Headquarters"}</span>
            {user.department && (
              <>
                <span>&bull;</span>
                <span className="text-gray-500">{user.department.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Live Notification Bell */}
            <NotificationBell />

            {/* Quick Profile Pill */}
            <Link
              href="/profile"
              className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              <div className="w-5 h-5 rounded-full bg-[#E42528] text-white flex items-center justify-center text-[10px] font-black">
                {user.name.charAt(0)}
              </div>
              <span className="text-xs font-semibold text-gray-800">{user.name}</span>
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
