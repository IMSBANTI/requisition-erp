import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatTaka } from "@/lib/money";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

interface Props {
  params: Promise<{ number: string }>;
}

export default async function PublicVerifyPage({ params }: Props) {
  const { number } = await params;

  const req = await prisma.requisition.findFirst({
    where: {
      OR: [{ number }, { id: number }],
    },
    include: {
      company: true,
      project: true,
      approvals: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!req) return notFound();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
        {/* Verification Banner */}
        <div className="bg-emerald-600 p-6 text-white text-center">
          <div className="inline-flex p-2 bg-emerald-700/60 rounded-full mb-2">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="text-base font-bold tracking-tight">Authentic IMS Document</h1>
          <p className="text-xs text-emerald-100 mt-0.5">
            Verified digitally via IMS Group ERP
          </p>
        </div>

        {/* Voucher Meta */}
        <div className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <div>
              <span className="text-xs text-gray-500 font-medium">Requisition No:</span>
              <p className="text-sm font-bold text-gray-900 font-mono">{req.number || "DRAFT"}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[req.status]}`}>
              {STATUS_LABELS[req.status] || req.status}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Company:</span>
              <span className="font-semibold text-gray-800">{req.company.legalName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Project:</span>
              <span className="font-semibold text-gray-800">{req.project.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date:</span>
              <span className="font-semibold text-gray-800">
                {new Date(req.date).toLocaleDateString("en-GB")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Requested By:</span>
              <span className="font-semibold text-gray-800">{req.makerName}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-700 font-bold">Total Approved Amount:</span>
              <span className="text-sm font-extrabold text-[#E42528]">
                Tk {formatTaka(req.total)}
              </span>
            </div>
          </div>

          {/* Signature Chain Verified */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Digital Signature Audit Trail
            </h2>
            <div className="space-y-2">
              {req.approvals.map((app) => (
                <div key={app.id} className="p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900 block">{app.signerName}</span>
                    <span className="text-[10px] text-gray-500">
                      {app.step} &bull; {new Date(app.createdAt).toLocaleString("en-GB")}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-800">
                    {app.action}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center text-[10px] text-gray-400">
            Official IMS GROUP Electronic Voucher Verification Portal
          </div>
        </div>
      </div>
    </div>
  );
}
