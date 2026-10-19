import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requisitionScope } from "@/lib/rbac";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import AppShell from "@/components/AppShell";

interface Props {
  searchParams: Promise<{ filter?: string; company?: string; search?: string }>;
}

export default async function RequisitionsListPage({ searchParams }: Props) {
  const user = await requireUser();
  const { filter, company, search } = await searchParams;

  const baseScope = requisitionScope(user);
  const andConditions: any[] = [baseScope];

  if (filter === "my") {
    andConditions.push({ makerId: user.id });
  } else if (filter === "pending") {
    const orPending: any[] = [{ currentAssigneeId: user.id }];
    if (user.permissions.includes("req.director")) {
      orPending.push({
        status: {
          in: ["PENDING_DIRECTOR", "PENDING_HEAD", "PENDING_CHECKER", "PENDING_ACCOUNTS"],
        },
      });
    }
    if (user.permissions.includes("req.accounts.check") || user.permissions.includes("req.forward")) {
      orPending.push({ status: { in: ["PENDING_ACCOUNTS", "APPROVED"] } });
    }
    if (user.permissions.includes("req.md")) {
      orPending.push({ status: "PENDING_MD" }, { mdStatus: "PENDING_BATCH" });
    }
    if (user.permissions.includes("req.execute")) {
      orPending.push({ status: { in: ["FORWARDED", "APPROVED"] } });
    }
    andConditions.push({ OR: orPending });
  } else if (filter === "to_execute") {
    andConditions.push({ status: { in: ["FORWARDED", "APPROVED"] } });
  }

  if (company) {
    andConditions.push({ company: { code: company } });
  }

  if (search) {
    andConditions.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { makerName: { contains: search, mode: "insensitive" } },
        { comments: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const whereClause = { AND: andConditions };

  const [requisitions, companies] = await Promise.all([
    prisma.requisition.findMany({
      where: whereClause,
      include: {
        company: true,
        project: true,
        maker: true,
        currentAssignee: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findMany({ select: { code: true, name: true } }),
  ]);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Requisitions
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Review, track, and approve requisitions across IMS Group companies.
            </p>
          </div>
          <Link
            href="/requisitions/new"
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md transition-colors shadow-sm self-start sm:self-auto"
          >
            + New Requisition
          </Link>
        </div>

        {/* Filters and Search Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/requisitions"
              className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                !filter ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All
            </Link>
            <Link
              href="/requisitions?filter=pending"
              className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                filter === "pending" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Pending My Signature
            </Link>
            <Link
              href="/requisitions?filter=my"
              className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                filter === "my" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              My Postings
            </Link>
            {user.permissions.includes("req.execute") && (
              <Link
                href="/requisitions?filter=to_execute"
                className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                  filter === "to_execute" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                To Execute
              </Link>
            )}
          </div>

          {/* Company Filter Tabs */}
          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-gray-400 font-semibold uppercase mr-1">Co:</span>
            {companies.map((c) => (
              <Link
                key={c.code}
                href={`/requisitions?${new URLSearchParams({ ...(filter ? { filter } : {}), company: c.code }).toString()}`}
                className={`px-2 py-0.5 text-[11px] rounded font-semibold border ${
                  company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {c.code}
              </Link>
            ))}
            {company && (
              <Link href={`/requisitions${filter ? `?filter=${filter}` : ""}`} className="text-xs text-red-500 hover:underline ml-1">
                Clear
              </Link>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {requisitions.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500">
              No requisitions match the current view.
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
                    <th className="py-2.5 px-4">Current Assignee</th>
                    <th className="py-2.5 px-4 text-right">Amount (Tk)</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requisitions.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/requisitions/${req.id}`} className="font-bold text-gray-900 hover:text-[#E42528]">
                          {req.number || "Draft"}
                        </Link>
                        <span className="block text-[11px] text-gray-400">
                          {new Date(req.date).toLocaleDateString("en-GB")}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-gray-800">{req.company.name}</span>
                        <span className="block text-[11px] text-gray-500 truncate max-w-[200px]">
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
                      <td className="py-3 px-4">
                        {req.currentAssignee ? (
                          <div>
                            <span className="font-medium text-gray-900">{req.currentAssignee.name}</span>
                            <span className="block text-[10px] text-gray-500">{req.currentAssignee.designation}</span>
                          </div>
                        ) : req.status === "PENDING_ACCOUNTS" ? (
                          <span className="text-[11px] font-semibold text-blue-700">Accounts Manager Queue</span>
                        ) : req.status === "PENDING_MD" ? (
                          <span className="text-[11px] font-semibold text-purple-700">MD Queue</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900">
                        {formatTaka(req.total)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[req.status] || "bg-gray-100"}`}>
                          {STATUS_LABELS[req.status] || req.status}
                        </span>
                        {req.mdStatus === "PENDING_BATCH" && (
                          <span className="block text-[9px] font-bold text-purple-600 mt-0.5">
                            Batch MD
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Link
                          href={`/requisitions/${req.id}`}
                          className="font-bold text-[#E42528] hover:underline"
                        >
                          Open &rarr;
                        </Link>
                        <Link
                          href={`/requisitions/${req.id}/print`}
                          target="_blank"
                          className="text-gray-500 hover:text-gray-800"
                          title="Print A4 Voucher"
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
