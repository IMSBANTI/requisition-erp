import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar from "./Sidebar";

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
        {children}
      </main>
    </div>
  );
}
