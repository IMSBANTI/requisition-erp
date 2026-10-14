import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requisitionScope } from "@/lib/rbac";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import AppShell from "@/components/AppShell";

export default async function DashboardPage() {
  const user = await requireUser();

  // Scoped queries
  const scope = requisitionScope(user);

  const [
    totalCount,
    myCount,
    pendingMySignature,
    pendingAccounts,
    toExecuteCount,
    batchCount,
    recentRequisitions,
  ] = await Promise.all([
    prisma.requisition.count({ where: scope }),
    prisma.requisition.count({ where: { makerId: user.id } }),
    prisma.requisition.count({ where: { currentAssigneeId: user.id } }),
    user.permissions.includes("req.accounts.check")
      ? prisma.requisition.count({ where: { status: "PENDING_ACCOUNTS" } })
      : Promise.resolve(0),
    user.permissions.includes("req.execute")
      ? prisma.requisition.count({ where: { status: "FORWARDED", executorId: user.id } })
      : Promise.resolve(0),
    user.permissions.includes("req.md")
      ? prisma.requisition.count({ where: { mdStatus: "PENDING_BATCH" } })
      : Promise.resolve(0),
    prisma.requisition.findMany({
      where: scope,
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        company: true,
        project: true,
        maker: true,
      },
    }),
  ]);

  const totalPending = pendingMySignature + pendingAccounts;

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        {/* Top welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Welcome back, {user.name}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {user.designation} &bull; {user.role.name}
              {user.company && ` &bull; ${user.company.name}`}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              href="/print/blank"
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
              Print Blank Form
            </Link>
            <Link
              href="/requisitions/new"
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md transition-colors shadow-sm flex items-center space-x-1"
            >
              <span>+</span>
              <span>New Requisition</span>
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-medium text-gray-500">My Requisitions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{myCount}</p>
            <Link href="/requisitions?filter=my" className="text-[11px] text-[#E42528] hover:underline font-medium mt-1 inline-block">
              View my postings &rarr;
            </Link>
          </div>

          <div className={`p-4 rounded-xl border shadow-sm ${totalPending > 0 ? "bg-red-50/50 border-red-200" : "bg-white border-gray-200"}`}>
            <p className="text-xs font-medium text-gray-500">Pending My Signature</p>
            <p className={`text-2xl font-bold mt-1 ${totalPending > 0 ? "text-[#E42528]" : "text-gray-900"}`}>
              {totalPending}
            </p>
            <Link href="/requisitions?filter=pending" className="text-[11px] text-[#E42528] hover:underline font-medium mt-1 inline-block">
              Review & Sign &rarr;
            </Link>
          </div>

          {user.permissions.includes("req.md") && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-medium text-gray-500">MD Batch Queue</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{batchCount}</p>
              <Link href="/md/batch" className="text-[11px] text-purple-600 hover:underline font-medium mt-1 inline-block">
                Open batch approval &rarr;
              </Link>
            </div>
          )}

          {user.permissions.includes("req.execute") && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-medium text-gray-500">To Execute / Disburse</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{toExecuteCount}</p>
              <Link href="/requisitions?filter=to_execute" className="text-[11px] text-emerald-600 hover:underline font-medium mt-1 inline-block">
                Accounts queue &rarr;
              </Link>
            </div>
          )}

          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total In Scope</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
            <Link href="/requisitions" className="text-[11px] text-gray-600 hover:underline font-medium mt-1 inline-block">
              Browse all &rarr;
            </Link>
          </div>
        </div>

        {/* Recent Requisitions Table */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recent Requisitions</h2>
            <Link href="/requisitions" className="text-xs text-[#E42528] font-semibold hover:underline">
              View All ({totalCount}) &rarr;
            </Link>
          </div>

          {recentRequisitions.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              No requisitions found yet. Click <strong>+ New Requisition</strong> to raise one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                    <th className="py-2.5 px-4">Req # / Date</th>
                    <th className="py-2.5 px-4">Company & Project</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Requested By</th>
                    <th className="py-2.5 px-4 text-right">Amount (Tk)</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentRequisitions.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/requisitions/${req.id}`} className="font-semibold text-gray-900 hover:text-[#E42528]">
                          {req.number || "Draft"}
                        </Link>
                        <span className="block text-[11px] text-gray-400">
                          {new Date(req.date).toLocaleDateString("en-GB")}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-800">{req.company.name}</span>
                        <span className="block text-[11px] text-gray-500 truncate max-w-[180px]">
                          {req.project.name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                          {req.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-800">{req.makerName}</span>
                        <span className="block text-[11px] text-gray-500">{req.makerDesignation}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        {formatTaka(req.total)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[req.status] || "bg-gray-100"}`}>
                          {STATUS_LABELS[req.status] || req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Link
                          href={`/requisitions/${req.id}`}
                          className="font-semibold text-[#E42528] hover:underline"
                        >
                          View
                        </Link>
                        <Link
                          href={`/requisitions/${req.id}/print`}
                          target="_blank"
                          className="text-gray-500 hover:text-gray-700"
                          title="Print Voucher"
                        >
                          🖨️
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
