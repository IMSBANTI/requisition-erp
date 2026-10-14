import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requisitionScope } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatTaka } from "@/lib/money";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Permission check: report.view, manager, accounts, director, md, or admin
  const hasAccess =
    user.permissions.includes("report.view") ||
    user.permissions.includes("admin.users") ||
    user.permissions.includes("admin.readonly") ||
    user.permissions.includes("req.director") ||
    user.permissions.includes("req.md") ||
    user.permissions.includes("req.accounts.check") ||
    user.role.isManager;

  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied: Reports permission required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const projectId = searchParams.get("projectId");
  const departmentId = searchParams.get("departmentId");
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const paymentMode = searchParams.get("paymentMode");
  const type = searchParams.get("type");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim();
  const exportFormat = searchParams.get("export");

  // Base scope based on RBAC
  const baseScope = requisitionScope(user);

  // Construct where clause
  const where: any = {
    AND: [baseScope],
  };

  if (companyId && companyId !== "ALL") {
    where.AND.push({ companyId });
  }
  if (projectId && projectId !== "ALL") {
    where.AND.push({ projectId });
  }
  if (departmentId && departmentId !== "ALL") {
    where.AND.push({ departmentId });
  }
  if (category && category !== "ALL") {
    where.AND.push({ category });
  }
  if (status && status !== "ALL") {
    where.AND.push({ status });
  }
  if (paymentMode && paymentMode !== "ALL") {
    where.AND.push({ paymentMode });
  }
  if (type && type !== "ALL") {
    where.AND.push({ type });
  }

  if (startDate || endDate) {
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      // Set end of the selected day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    where.AND.push({ date: dateFilter });
  }

  if (search) {
    where.AND.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { makerName: { contains: search, mode: "insensitive" } },
        { comments: { contains: search, mode: "insensitive" } },
        { vendor: { contains: search, mode: "insensitive" } },
        {
          items: {
            some: {
              OR: [
                { particulars: { contains: search, mode: "insensitive" } },
                { purpose: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  const requisitions = await prisma.requisition.findMany({
    where,
    include: {
      company: { select: { id: true, name: true, code: true } },
      project: { select: { id: true, name: true, category: true, budget: true } },
      department: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true, email: true } },
      currentAssignee: { select: { id: true, name: true, designation: true } },
      executor: { select: { id: true, name: true } },
      items: {
        orderBy: { sl: "asc" },
      },
      approvals: {
        select: { step: true, action: true, signerName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { date: "desc" },
  });

  // Calculate Aggregations & Metrics
  let totalRequested = 0;
  let totalApproved = 0;
  let totalExecuted = 0;
  let totalPending = 0;
  let totalRejected = 0;

  const companyBreakdown: Record<string, { name: string; count: number; total: number }> = {};
  const projectBreakdown: Record<string, { name: string; code?: string; count: number; total: number; budget: number }> = {};
  const categoryBreakdown: Record<string, { count: number; total: number }> = {};
  const statusBreakdown: Record<string, { count: number; total: number }> = {};
  const monthBreakdown: Record<string, { month: string; count: number; requested: number; approved: number; executed: number }> = {};

  for (const r of requisitions) {
    const amt = Number(r.total);
    totalRequested += amt;

    const isExecuted = r.status === "EXECUTED";
    const isApproved = ["APPROVED", "FORWARDED", "EXECUTED"].includes(r.status);
    const isPending = [
      "SUBMITTED",
      "PENDING_HEAD",
      "PENDING_CHECKER",
      "PENDING_ACCOUNTS",
      "PENDING_DIRECTOR",
      "PENDING_MD",
    ].includes(r.status);
    const isRejected = ["REJECTED", "RETURNED", "CANCELLED"].includes(r.status);

    if (isExecuted) totalExecuted += amt;
    if (isApproved) totalApproved += amt;
    if (isPending) totalPending += amt;
    if (isRejected) totalRejected += amt;

    // Company breakdown
    const coName = r.company.name;
    if (!companyBreakdown[coName]) {
      companyBreakdown[coName] = { name: coName, count: 0, total: 0 };
    }
    companyBreakdown[coName].count += 1;
    companyBreakdown[coName].total += amt;

    // Project breakdown
    const projName = r.project.name;
    if (!projectBreakdown[projName]) {
      projectBreakdown[projName] = {
        name: projName,
        count: 0,
        total: 0,
        budget: Number(r.project.budget || 0),
      };
    }
    projectBreakdown[projName].count += 1;
    projectBreakdown[projName].total += amt;

    // Category breakdown
    const cat = r.category || "GENERAL";
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = { count: 0, total: 0 };
    }
    categoryBreakdown[cat].count += 1;
    categoryBreakdown[cat].total += amt;

    // Status breakdown
    const st = r.status;
    if (!statusBreakdown[st]) {
      statusBreakdown[st] = { count: 0, total: 0 };
    }
    statusBreakdown[st].count += 1;
    statusBreakdown[st].total += amt;

    // Month breakdown (YYYY-MM)
    const d = new Date(r.date);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthBreakdown[mKey]) {
      monthBreakdown[mKey] = {
        month: mKey,
        count: 0,
        requested: 0,
        approved: 0,
        executed: 0,
      };
    }
    monthBreakdown[mKey].count += 1;
    monthBreakdown[mKey].requested += amt;
    if (isApproved) monthBreakdown[mKey].approved += amt;
    if (isExecuted) monthBreakdown[mKey].executed += amt;
  }

  // Handle CSV Export
  if (exportFormat === "csv") {
    const headers = [
      "Requisition No",
      "Date",
      "Company",
      "Project",
      "Department",
      "Category",
      "Type Tag",
      "Maker Name",
      "Maker Designation",
      "Amount (BDT)",
      "Payment Mode",
      "Vendor",
      "Disburse On",
      "Status",
      "MD Status",
      "Current Assignee",
      "Line Items Count",
      "Particulars Summary",
      "Comments",
    ];

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const rows = requisitions.map((r) => {
      const particulars = r.items.map((it) => `${it.sl}. ${it.particulars} (Qty: ${it.qty}, Tk ${it.amount})`).join(" | ");
      return [
        escapeCsv(r.number || "DRAFT"),
        escapeCsv(new Date(r.date).toISOString().split("T")[0]),
        escapeCsv(r.company.name),
        escapeCsv(r.project.name),
        escapeCsv(r.department?.name || "—"),
        escapeCsv(r.category),
        escapeCsv(r.type),
        escapeCsv(r.makerName),
        escapeCsv(r.makerDesignation),
        escapeCsv(Number(r.total).toFixed(2)),
        escapeCsv(r.paymentMode || "—"),
        escapeCsv(r.vendor || "—"),
        escapeCsv(r.disburseOn ? new Date(r.disburseOn).toISOString().split("T")[0] : "Immediate"),
        escapeCsv(r.status),
        escapeCsv(r.mdStatus),
        escapeCsv(r.currentAssignee?.name || "—"),
        escapeCsv(r.items.length),
        escapeCsv(particulars),
        escapeCsv(r.comments || ""),
      ].join(",");
    });

    // Add summary row at the bottom
    rows.push("");
    rows.push(
      [
        escapeCsv("TOTAL SUMMARY"),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(`Count: ${requisitions.length}`),
        escapeCsv("Total Amount:"),
        escapeCsv(totalRequested.toFixed(2)),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
      ].join(",")
    );

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

    const dateStamp = new Date().toISOString().split("T")[0];
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="IMS_Requisitions_Report_${dateStamp}.csv"`,
      },
    });
  }

  return NextResponse.json({
    metrics: {
      count: requisitions.length,
      totalRequested,
      totalApproved,
      totalExecuted,
      totalPending,
      totalRejected,
      companyBreakdown: Object.values(companyBreakdown),
      projectBreakdown: Object.values(projectBreakdown).sort((a, b) => b.total - a.total),
      categoryBreakdown: Object.entries(categoryBreakdown).map(([name, data]) => ({ name, ...data })),
      statusBreakdown: Object.entries(statusBreakdown).map(([name, data]) => ({ name, ...data })),
      monthBreakdown: Object.values(monthBreakdown).sort((a, b) => a.month.localeCompare(b.month)),
    },
    requisitions,
  });
}
