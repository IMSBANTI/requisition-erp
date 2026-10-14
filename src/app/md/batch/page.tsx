import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import MDBatchClient from "./MDBatchClient";

export default async function MDBatchApprovalPage() {
  const user = await requireUser();

  if (!user.permissions.includes("req.md")) {
    redirect("/?denied=1");
  }

  // Find all requisitions waiting for MD Batch approval
  const requisitions = await prisma.requisition.findMany({
    where: {
      mdStatus: "PENDING_BATCH",
      status: { notIn: ["REJECTED", "RETURNED", "CANCELLED"] },
    },
    include: {
      company: true,
      project: true,
      maker: true,
      approvals: {
        where: { step: "DIRECTOR" },
        include: { user: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-xl">⚡</span>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Managing Director — Batch Approval Queue
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Bulk-approve requisitions for weekly/monthly batch projects that have already passed Director approval.
          </p>
        </div>

        <MDBatchClient
          requisitions={requisitions.map((r) => ({
            id: r.id,
            number: r.number,
            date: r.date.toISOString(),
            companyName: r.company.name,
            projectName: r.project.name,
            category: r.category,
            makerName: r.makerName,
            total: r.total.toString(),
            status: r.status,
            directorName: r.approvals[0]?.signerName || "Director",
          }))}
          userSignature={user.signature}
        />
      </div>
    </AppShell>
  );
}
