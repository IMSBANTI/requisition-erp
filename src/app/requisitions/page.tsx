import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectScope, requisitionScope } from "@/lib/rbac";
import { backupApproverPermissionTag } from "@/lib/workflow";
import { formatMoney, getCurrencyMeta } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import { ensureUploadedKitProjectsSynced } from "@/lib/projectSync";
import AppShell from "@/components/AppShell";
import RequisitionsFilterBar from "./RequisitionsFilterBar";

interface Props {
  searchParams: Promise<{
    filter?: string;
    company?: string;
    status?: string;
    project?: string;
    search?: string;
    page?: string;
    denied?: string;
  }>;
}

const PAGE_SIZE = 25;

export default async function RequisitionsListPage({ searchParams }: Props) {
  const user = await requireUser();
  await ensureUploadedKitProjectsSynced();
  const { filter, company, status, project, search, page, denied } = await searchParams;

  const currentPage = Math.max(1, parseInt(page || "1", 10) || 1);
  const baseScope = requisitionScope(user);
  const andConditions: any[] = [baseScope];

  if (filter === "my") {
    andConditions.push({ makerId: user.id });
  } else if (filter === "pending") {
    const orPending: any[] = [
      { currentAssigneeId: user.id },
      {
        status: "PENDING_HEAD",
        maker: { extraPermissions: { has: backupApproverPermissionTag(user.id) } },
      },
    ];
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
    andConditions.push({ status: { in: ["FORWARDED", "APPROVED", "PARTIAL_PAID"] } });
  }

  if (company) {
    andConditions.push({ company: { code: company } });
  }

  if (status) {
    andConditions.push({ status });
  }

  if (project) {
    andConditions.push({ projectId: project });
  }

  if (search && search.trim()) {
    const q = search.trim();
    andConditions.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { makerName: { contains: q, mode: "insensitive" } },
        { poNumber: { contains: q, mode: "insensitive" } },
        { comments: { contains: q, mode: "insensitive" } },
        { project: { name: { contains: q, mode: "insensitive" } } },
        { items: { some: { particulars: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  const whereClause = { AND: andConditions };

  const [totalMatching, requisitions, companies, projectsList] = await Promise.all([
    prisma.requisition.count({ where: whereClause }),
    prisma.requisition.findMany({
      where: whereClause,
      include: {
        company: true,
        project: true,
        maker: true,
        currentAssignee: true,
        attachments: {
          select: { id: true, fileName: true, isPo: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.company.findMany({ select: { code: true, name: true } }),
    prisma.project.findMany({
      where: projectScope(user),
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const buildPageHref = (targetPage: number) => {
    const p = new URLSearchParams();
    if (filter) p.set("filter", filter);
    if (company) p.set("company", company);
    if (status) p.set("status", status);
    if (project) p.set("project", project);
    if (search) p.set("search", search);
    if (targetPage > 1) p.set("page", String(targetPage));
    const qs = p.toString();
    return qs ? `/requisitions?${qs}` : "/requisitions";
  };

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto w-full">
        {denied === "1" && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <span>
              <strong>Access restricted:</strong> You do not have permission to open that requisition.
            </span>
            <Link href="/requisitions" className="text-[11px] font-bold text-amber-800 hover:underline shrink-0">
              Dismiss
            </Link>
          </div>
        )}

        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Requisitions
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Review, track, and approve requisitions across IMS Group companies.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link
              href="/print/blank"
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-2xs inline-flex items-center gap-1.5"
            >
              <span>🖨️</span>
              <span>Print Blank Form</span>
            </Link>
            <Link
              href="/requisitions/new"
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded-md transition-colors shadow-sm"
            >
              + New Requisition
            </Link>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="mt-4 bg-white p-2.5 sm:p-3 rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/requisitions"
              className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                !filter ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All
            </Link>
            <Link
              href="/requisitions?filter=pending"
              className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                filter === "pending" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Pending My Signature
            </Link>
            <Link
              href="/requisitions?filter=my"
              className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                filter === "my" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              My Postings
            </Link>
            {user.permissions.includes("req.execute") && (
              <Link
                href="/requisitions?filter=to_execute"
                className={`px-2.5 sm:px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                  filter === "to_execute" ? "bg-red-50 text-[#E42528] border border-red-200" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                To Execute
              </Link>
            )}
          </div>

          {/* Company Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-gray-400 font-semibold uppercase mr-1">Co:</span>
            {companies.map((c) => (
              <Link
                key={c.code}
                href={`/requisitions?${new URLSearchParams({
                  ...(filter ? { filter } : {}),
                  ...(status ? { status } : {}),
                  ...(project ? { project } : {}),
                  ...(search ? { search } : {}),
                  company: c.code,
                }).toString()}`}
                className={`px-2 py-0.5 text-[11px] rounded font-semibold border ${
                  company === c.code ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {c.code}
              </Link>
            ))}
            {company && (
              <Link
                href={`/requisitions?${new URLSearchParams({
                  ...(filter ? { filter } : {}),
                  ...(status ? { status } : {}),
                  ...(project ? { project } : {}),
                  ...(search ? { search } : {}),
                }).toString()}`}
                className="text-xs text-red-500 hover:underline ml-1"
              >
                Clear
              </Link>
            )}
          </div>
          </div>

          <RequisitionsFilterBar
            initialSearch={search || ""}
            initialStatus={status || ""}
            initialProjectId={project || ""}
            filter={filter}
            company={company}
            projects={projectsList}
          />
        </div>

        {/* List / Table */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {requisitions.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500">
              No requisitions match the current view.
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="md:hidden divide-y divide-gray-200">
                {requisitions.map((req) => {
                  const poFiles = (req.attachments || []).filter(
                    (a: any) => a.isPo || a.fileName.startsWith("[PO]")
                  );
                  const hasPo = Boolean((req as any).poNumber || poFiles.length > 0);
                  return (
                    <div key={req.id} className="p-3.5 space-y-2 hover:bg-gray-50/70">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/requisitions/${req.id}`}
                              className="text-xs font-bold text-gray-900 hover:text-[#E42528]"
                            >
                              {req.number || "Draft"}
                            </Link>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                              {req.type}
                            </span>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                STATUS_COLORS[req.status] || "bg-gray-100"
                              }`}
                            >
                              {STATUS_LABELS[req.status] || req.status}
                            </span>
                            {req.mdStatus === "PENDING_BATCH" && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Batch MD
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {new Date(req.date).toLocaleDateString("en-GB")} &bull; {req.makerName}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold text-gray-900">
                            {getCurrencyMeta((req as any).currency, req.amountInWords).listPrefix}{" "}
                            {formatMoney(req.total, getCurrencyMeta((req as any).currency, req.amountInWords).code)}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">{req.company.name}</span>
                        {" — "}
                        <span>{req.project.name}</span>
                      </div>

                      <div className="text-[11px] text-gray-500 flex items-center justify-between">
                        <span>
                          Assignee:{" "}
                          {req.currentAssignee ? (
                            <strong className="text-gray-800">{req.currentAssignee.name}</strong>
                          ) : req.status === "PENDING_ACCOUNTS" ? (
                            <strong className="text-blue-700">Accounts Manager Queue</strong>
                          ) : req.status === "PENDING_MD" ? (
                            <strong className="text-purple-700">MD Queue</strong>
                          ) : (
                            "—"
                          )}
                        </span>
                      </div>

                      {hasPo && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white whitespace-nowrap shrink-0">
                            📄 PO{(req as any).poNumber ? `: ${(req as any).poNumber}` : " Attached"}
                          </span>
                          {poFiles[0] && (
                            <>
                              <a
                                href={`/api/attachments/${poFiles[0].id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap"
                              >
                                <span>👁️</span>
                                <span>View PO</span>
                              </a>
                              <a
                                href={`/api/attachments/${poFiles[0].id}?download=1`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap"
                              >
                                <span>⬇️</span>
                                <span>Download</span>
                              </a>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <Link
                          href={`/requisitions/${req.id}`}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 text-[#E42528] border border-red-200 text-xs font-bold"
                        >
                          Open / Sign Requisition &rarr;
                        </Link>
                        <Link
                          href={`/requisitions/${req.id}/print`}
                          target="_blank"
                          className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold"
                        >
                          🖨️ Print
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                      <th className="py-2.5 px-4">Req # / Date</th>
                      <th className="py-2.5 px-4">Company & Project</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Requested By</th>
                      <th className="py-2.5 px-4">Current Assignee</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requisitions.map((req) => {
                      const poFiles = (req.attachments || []).filter(
                        (a: any) => a.isPo || a.fileName.startsWith("[PO]")
                      );
                      const hasPo = Boolean((req as any).poNumber || poFiles.length > 0);
                      return (
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
                          {hasPo && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white whitespace-nowrap shrink-0">
                                📄 PO{(req as any).poNumber ? `: ${(req as any).poNumber}` : " Attached"}
                              </span>
                              {poFiles[0] && (
                                <>
                                  <a
                                    href={`/api/attachments/${poFiles[0].id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap shrink-0"
                                    title="View PO in browser"
                                  >
                                    <span>👁️</span>
                                    <span>View PO</span>
                                  </a>
                                  <a
                                    href={`/api/attachments/${poFiles[0].id}?download=1`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap shrink-0"
                                    title="Download PO"
                                  >
                                    <span>⬇️</span>
                                    <span>Download</span>
                                  </a>
                                </>
                              )}
                            </div>
                          )}
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
                        <td className="py-3 px-4 text-right font-bold text-gray-900 whitespace-nowrap">
                          <span className="text-[10px] font-semibold text-gray-500 mr-1">
                            {getCurrencyMeta((req as any).currency, req.amountInWords).listPrefix}
                          </span>
                          {formatMoney(req.total, getCurrencyMeta((req as any).currency, req.amountInWords).code)}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination Footer */}
          {totalMatching > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/60 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
              <span>
                Showing{" "}
                <strong>{(currentPage - 1) * PAGE_SIZE + 1}</strong>–
                <strong>{Math.min(currentPage * PAGE_SIZE, totalMatching)}</strong> of{" "}
                <strong>{totalMatching}</strong> requisition{totalMatching === 1 ? "" : "s"}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  {currentPage > 1 ? (
                    <Link
                      href={buildPageHref(currentPage - 1)}
                      className="px-2.5 py-1 rounded border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      &larr; Prev
                    </Link>
                  ) : (
                    <span className="px-2.5 py-1 rounded border border-gray-200 bg-gray-100 text-gray-400 font-semibold">
                      &larr; Prev
                    </span>
                  )}
                  <span className="px-2 font-semibold text-gray-800">
                    Page {currentPage} / {totalPages}
                  </span>
                  {currentPage < totalPages ? (
                    <Link
                      href={buildPageHref(currentPage + 1)}
                      className="px-2.5 py-1 rounded border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Next &rarr;
                    </Link>
                  ) : (
                    <span className="px-2.5 py-1 rounded border border-gray-200 bg-gray-100 text-gray-400 font-semibold">
                      Next &rarr;
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
