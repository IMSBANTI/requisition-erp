import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";

export default async function AdminAuditPage() {
  const user = await requireUser();

  if (!user.permissions.includes("audit.view")) {
    redirect("/?denied=1");
  }

  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { name: true, designation: true, email: true },
      },
      requisition: {
        select: { number: true, total: true },
      },
    },
  });

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Security & Approval Audit Trail
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Cryptographically tracked audit logs for all digital signatures, workflow actions, and admin operations.
          </p>
        </div>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Requisition #</th>
                  <th className="py-2.5 px-4">Details</th>
                  <th className="py-2.5 px-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-900 block">{log.user?.name || "System"}</span>
                      <span className="text-[10px] text-gray-500">{log.user?.designation || ""}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-gray-800">
                      {log.requisition?.number || "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-700 max-w-md">
                      {log.details || "—"}
                    </td>
                    <td className="py-3 px-4 text-gray-400 font-mono text-[10px]">
                      {log.ip || "local"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
