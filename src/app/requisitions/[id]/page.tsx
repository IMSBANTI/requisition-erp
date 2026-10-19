import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allowedActions } from "@/lib/workflow";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import AppShell from "@/components/AppShell";
import RequisitionActionPanel from "./RequisitionActionPanel";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequisitionDetailPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      company: true,
      project: true,
      department: true,
      maker: true,
      currentAssignee: true,
      executor: true,
      items: { orderBy: { sl: "asc" } },
      approvals: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      attachments: true,
      auditLogs: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!req) return notFound();

  // Find accounts executives for forward action & directors for routing
  const [accountsExecutives, directors] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { key: "accounts_executive" },
        active: true,
      },
      select: { id: true, name: true, designation: true },
    }),
    prisma.user.findMany({
      where: {
        role: { permissions: { has: "req.director" } },
        active: true,
      },
      orderBy: { employeeId: "asc" },
      select: { id: true, name: true, designation: true },
    }),
  ]);

  // Calculate available actions for this logged-in user
  const actions = allowedActions(
    { id: user.id, permissions: user.permissions },
    {
      status: req.status,
      makerId: req.makerId,
      currentAssigneeId: req.currentAssigneeId,
      executorId: req.executorId,
      mdStatus: req.mdStatus,
    }
  );

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto w-full">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Link href="/requisitions" className="text-xs text-gray-500 hover:text-gray-800">
                &larr; Requisitions
              </Link>
              <span className="text-gray-300">/</span>
              <span className="font-bold text-gray-900 text-sm">{req.number || "Draft Voucher"}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[req.status]}`}>
                {STATUS_LABELS[req.status] || req.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Project: <strong>{req.project.name}</strong> &bull; Company: <strong>{req.company.name}</strong>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href={`/requisitions/${req.id}/print`}
              target="_blank"
              className="px-3.5 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm flex items-center space-x-1.5"
            >
              <span>🖨️</span>
              <span>Print A4 Voucher</span>
            </Link>
          </div>
        </div>

        {/* Action Panel if user can act */}
        <RequisitionActionPanel
          requisitionId={req.id}
          number={req.number}
          status={req.status}
          actions={actions}
          userName={user.name}
          userEmail={user.email}
          userPermissions={user.permissions}
          userSignature={user.signature}
          hasPin={!!user.pinHash}
          accountsExecutives={accountsExecutives}
          directors={directors}
          defaultDirectorId={req.project.directorId}
        />

        {/* Paper Voucher Replica */}
        <div
          className="mt-6 bg-white p-6 sm:p-8 rounded-xl border-2 border-gray-300 shadow-md"
          style={{
            backgroundColor: req.company.paperTint === "#FFF4C2" ? "#FFFAE0" : "#FFFFFF",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-gray-300">
            <div className="flex items-center space-x-3">
              <img
                src={req.company.logo || "/logos/ims.png"}
                alt={req.company.name}
                className="h-12 w-auto object-contain"
              />
              <div className="leading-tight">
                <span className="text-sm font-bold text-gray-900 tracking-tight">
                  {req.company.name?.toLowerCase()}{" "}
                  <span className="text-red-600 font-extrabold uppercase">({req.type})</span>
                </span>
                <p className="text-[11px] font-bold text-gray-800 underline uppercase tracking-wide mt-0.5">
                  REQUISITION FOR FUND
                </p>
              </div>
            </div>

            <div className="text-right max-w-sm">
              <h2 className="text-xs font-bold text-gray-900">
                {req.company.legalName}
              </h2>
              <p className="text-[10px] text-gray-600 leading-tight mt-0.5">
                {req.company.address}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {req.company.phone && `Phone: ${req.company.phone} • `}
                {req.company.email && `Email: ${req.company.email}`}
              </p>
              {req.company.website && (
                <p className="text-[10px] text-gray-500 font-medium">{req.company.website}</p>
              )}
            </div>
          </div>

          {/* Body Info */}
          <div className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 w-24">Name :</span>
              <span className="font-bold text-gray-900">{req.makerName}</span>
            </div>
            <div className="flex items-center justify-end">
              <span className="font-semibold text-gray-700 mr-2">Date :</span>
              <span className="font-medium text-gray-900">
                {new Date(req.date).toLocaleDateString("en-GB")}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-gray-700 w-24">Designation :</span>
              <span className="text-gray-800">{req.makerDesignation}</span>
            </div>
            <div className="flex items-center justify-end">
              <span className="font-semibold text-gray-700 mr-2">Disburse on :</span>
              <span className="font-medium text-gray-900">
                {req.disburseOn ? new Date(req.disburseOn).toLocaleDateString("en-GB") : "Immediate"}
              </span>
            </div>
          </div>

          {/* Amount In Words */}
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-800">
            <span className="font-semibold text-gray-700">An amount Tk. </span>
            <span className="font-extrabold text-sm text-[#E42528] px-2 py-0.5 bg-red-50 border border-red-200 rounded">
              {formatTaka(req.total)}
            </span>
            <span className="font-semibold text-gray-700 ml-1.5">(In word) : </span>
            <span className="italic font-bold text-gray-900 underline underline-offset-2">
              {req.amountInWords}
            </span>
          </div>

          {/* Line Items Table */}
          <div className="mt-4 border border-gray-400 rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-400 text-gray-700 font-bold uppercase text-[10px]">
                  <th className="py-1.5 px-2 w-10 text-center border-r border-gray-300">SL.</th>
                  <th className="py-1.5 px-3 border-r border-gray-300">Particulars</th>
                  <th className="py-1.5 px-3 border-r border-gray-300 w-1/4">Purpose</th>
                  <th className="py-1.5 px-2 border-r border-gray-300 w-16 text-right">Qty.</th>
                  <th className="py-1.5 px-2 border-r border-gray-300 w-24 text-right">Unit Price</th>
                  <th className="py-1.5 px-3 w-28 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {req.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-1 px-2 text-center font-semibold text-gray-600 border-r border-gray-300">
                      {it.sl}
                    </td>
                    <td className="py-1 px-3 font-medium text-gray-900 border-r border-gray-300">
                      {it.particulars}
                    </td>
                    <td className="py-1 px-3 text-gray-700 border-r border-gray-300">
                      {it.purpose || "—"}
                    </td>
                    <td className="py-1 px-2 text-right font-medium text-gray-900 border-r border-gray-300">
                      {it.qty.toString()}
                    </td>
                    <td className="py-1 px-2 text-right text-gray-800 border-r border-gray-300">
                      {formatTaka(it.unitPrice)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold text-gray-900">
                      {formatTaka(it.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold text-xs border-t-2 border-gray-400">
                  <td colSpan={5} className="py-2 px-4 text-right uppercase tracking-wider border-r border-gray-300">
                    Total
                  </td>
                  <td className="py-2 px-3 text-right text-sm text-[#E42528] font-extrabold">
                    {formatTaka(req.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Comments */}
          {req.comments && (
            <div className="mt-4 text-xs">
              <span className="font-semibold text-gray-700">Comments: </span>
              <span className="text-gray-800 italic">{req.comments}</span>
            </div>
          )}

          {/* 5 Paper Signature Boxes with Digital Signatures */}
          <div className="mt-8 pt-4 border-t border-gray-400">
            <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
              {/* Box 1: Requested by */}
              <div className="border-t border-gray-800 pt-1 flex flex-col justify-between min-h-[75px]">
                <div>
                  <span className="font-bold block text-gray-900">Requested by</span>
                  <span className="text-gray-600">{req.makerName}</span>
                </div>
                {req.approvals.find((a) => a.step === "MAKER")?.signature ? (
                  <img
                    src={req.approvals.find((a) => a.step === "MAKER")!.signature!}
                    alt="Signature"
                    className="h-9 w-auto mx-auto object-contain my-0.5"
                  />
                ) : (
                  <span className="text-[9px] text-green-700 font-mono font-semibold">Digitally Signed</span>
                )}
                <span className="text-[9px] text-gray-400">
                  {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString("en-GB") : ""}
                </span>
              </div>

              {/* Box 2: Checked by (Head) */}
              <div className="border-t border-gray-800 pt-1 flex flex-col justify-between min-h-[75px]">
                <div>
                  <span className="font-bold block text-gray-900">Checked by</span>
                  <span className="text-gray-600">
                    {req.approvals.find((a) => a.step === "HEAD")?.signerName || "Head"}
                  </span>
                </div>
                {req.approvals.find((a) => a.step === "HEAD")?.signature ? (
                  <img
                    src={req.approvals.find((a) => a.step === "HEAD")!.signature!}
                    alt="Signature"
                    className="h-9 w-auto mx-auto object-contain my-0.5"
                  />
                ) : req.approvals.some((a) => a.step === "HEAD") ? (
                  <span className="text-[9px] text-green-700 font-mono font-semibold">Digitally Signed</span>
                ) : (
                  <span className="text-[9px] text-gray-300 italic">Pending</span>
                )}
                <span className="text-[9px] text-gray-400">
                  {req.approvals.find((a) => a.step === "HEAD")
                    ? new Date(req.approvals.find((a) => a.step === "HEAD")!.createdAt).toLocaleDateString("en-GB")
                    : ""}
                </span>
              </div>

              {/* Box 3: Checked by (Checker) */}
              <div className="border-t border-gray-800 pt-1 flex flex-col justify-between min-h-[75px]">
                <div>
                  <span className="font-bold block text-gray-900">Checked by</span>
                  <span className="text-gray-600">
                    {req.approvals.find((a) => a.step === "CHECKER")?.signerName || "Sr. Manager / Checker"}
                  </span>
                </div>
                {req.approvals.find((a) => a.step === "CHECKER")?.signature ? (
                  <img
                    src={req.approvals.find((a) => a.step === "CHECKER")!.signature!}
                    alt="Signature"
                    className="h-9 w-auto mx-auto object-contain my-0.5"
                  />
                ) : req.approvals.some((a) => a.step === "CHECKER") ? (
                  <span className="text-[9px] text-green-700 font-mono font-semibold">Digitally Signed</span>
                ) : (
                  <span className="text-[9px] text-gray-300 italic">—</span>
                )}
                <span className="text-[9px] text-gray-400">
                  {req.approvals.find((a) => a.step === "CHECKER")
                    ? new Date(req.approvals.find((a) => a.step === "CHECKER")!.createdAt).toLocaleDateString("en-GB")
                    : ""}
                </span>
              </div>

              {/* Box 4: Checked by Accounts */}
              <div className="border-t border-gray-800 pt-1 flex flex-col justify-between min-h-[75px]">
                <div>
                  <span className="font-bold block text-gray-900">Checked by Accounts</span>
                  <span className="text-gray-600">
                    {req.approvals.find((a) => a.step === "ACCOUNTS")?.signerName || "Accounts Manager"}
                  </span>
                </div>
                {req.approvals.find((a) => a.step === "ACCOUNTS")?.signature ? (
                  <img
                    src={req.approvals.find((a) => a.step === "ACCOUNTS")!.signature!}
                    alt="Signature"
                    className="h-9 w-auto mx-auto object-contain my-0.5"
                  />
                ) : req.approvals.some((a) => a.step === "ACCOUNTS") ? (
                  <span className="text-[9px] text-green-700 font-mono font-semibold">Digitally Signed</span>
                ) : (
                  <span className="text-[9px] text-gray-300 italic">Pending</span>
                )}
                <span className="text-[9px] text-gray-400">
                  {req.approvals.find((a) => a.step === "ACCOUNTS")
                    ? new Date(req.approvals.find((a) => a.step === "ACCOUNTS")!.createdAt).toLocaleDateString("en-GB")
                    : ""}
                </span>
              </div>

              {/* Box 5: Approve by management (Director + MD) */}
              <div className="border-t border-gray-800 pt-1 flex flex-col justify-between min-h-[75px]">
                <div>
                  <span className="font-bold block text-gray-900">Approve by management</span>
                  <span className="text-gray-600">
                    {[
                      req.approvals.find((a) => a.step === "DIRECTOR")?.signerName,
                      req.approvals.find((a) => a.step === "MD")?.signerName,
                    ]
                      .filter(Boolean)
                      .join(" & ") || "Director & MD"}
                  </span>
                </div>
                <div className="flex items-center justify-center space-x-1 my-0.5">
                  {req.approvals.find((a) => a.step === "DIRECTOR")?.signature ? (
                    <img
                      src={req.approvals.find((a) => a.step === "DIRECTOR")!.signature!}
                      alt="Director"
                      className="h-8 w-auto object-contain"
                      title="Director Signature"
                    />
                  ) : req.approvals.some((a) => a.step === "DIRECTOR") ? (
                    <span className="text-[9px] text-green-700 font-mono font-semibold">
                      ✓ Dir Signed
                    </span>
                  ) : null}
                  {req.approvals.find((a) => a.step === "MD")?.signature ? (
                    <img
                      src={req.approvals.find((a) => a.step === "MD")!.signature!}
                      alt="MD"
                      className="h-8 w-auto object-contain"
                      title="MD Signature"
                    />
                  ) : req.approvals.some((a) => a.step === "MD") ? (
                    <span className="text-[9px] text-purple-700 font-mono font-semibold">
                      ✓ MD Signed
                    </span>
                  ) : null}
                  {!req.approvals.some((a) => a.step === "DIRECTOR" || a.step === "MD") && (
                    <span className="text-[9px] text-gray-300 italic">Pending</span>
                  )}
                </div>
                <span className="text-[9px] text-gray-400">
                  {req.approvals.find((a) => a.step === "MD" || a.step === "DIRECTOR")
                    ? new Date(
                        (req.approvals.find((a) => a.step === "MD") || req.approvals.find((a) => a.step === "DIRECTOR"))!
                          .createdAt
                      ).toLocaleDateString("en-GB")
                    : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Attachments Section */}
        {req.attachments.length > 0 && (
          <div className="mt-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
              Attached Quotations & Invoices ({req.attachments.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {req.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-800 flex items-center space-x-1.5 transition-colors"
                >
                  <span>📎</span>
                  <span className="truncate max-w-[200px]">{att.fileName}</span>
                  <span className="text-[10px] text-gray-400">({Math.round(att.size / 1024)} KB)</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail & History */}
        <div className="mt-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
            Digital Signatures & Audit Trail
          </h3>
          <div className="space-y-3">
            {req.approvals.map((app) => (
              <div key={app.id} className="flex items-start space-x-3 text-xs border-l-2 border-red-500 pl-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-900">{app.signerName}</span>
                    <span className="text-[10px] font-semibold text-gray-500">({app.signerDesignation})</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-green-100 text-green-800">
                      {app.action}
                    </span>
                  </div>
                  {app.comment && <p className="text-gray-600 mt-0.5 italic">"{app.comment}"</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Step: {app.step} &bull; Timestamp: {new Date(app.createdAt).toLocaleString("en-GB")} &bull; Hash:{" "}
                    <span className="font-mono">{app.docHash.slice(0, 12)}...</span>
                  </p>
                </div>
                {app.signature && (
                  <img src={app.signature} alt="Sign" className="h-8 w-auto object-contain border p-0.5 rounded" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
