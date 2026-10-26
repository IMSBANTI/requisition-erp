import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calculateProfitSummary,
  getDefaultProjectTermsByCode,
  round2,
} from "@/lib/profitEngine";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const canManageFinance =
      user.permissions.includes("req.accounts.check") ||
      user.permissions.includes("req.execute") ||
      user.permissions.includes("req.director") ||
      user.permissions.includes("req.md") ||
      user.permissions.includes("admin.users") ||
      user.permissions.includes("project.manage") ||
      Boolean(user.role.isManager);

    if (!canManageFinance) {
      return NextResponse.json(
        { error: "Unauthorized to record client bills or payments" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      projectId,
      forMonth,
      billNumber,
      poNumber,
      status,
      billableCost,
      imsInvestment,
      customBillExVat,
      receivedAmount,
      poReceivedAt,
      grReceivedAt,
      submittedAt,
      dueDate,
      receivedAt,
      deviationReason,
      notes,
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Project or Event is required" }, { status: 400 });
    }

    const project: any = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project/Event not found" }, { status: 404 });
    }

    const fallbackTerms = getDefaultProjectTermsByCode(project.code, project.kind);
    const effectiveFixedBill =
      customBillExVat !== undefined && customBillExVat !== "" && Number(customBillExVat) > 0
        ? Number(customBillExVat)
        : project.fixedMonthlyBill && Number(project.fixedMonthlyBill) > 0
        ? Number(project.fixedMonthlyBill)
        : (project.billingProfile || fallbackTerms.billingProfile) === "FIXED_QUOTE" &&
          project.budget
        ? Number(project.budget)
        : Number(fallbackTerms.fixedMonthlyBill || 0);

    const calc = calculateProfitSummary({
      terms: {
        billingProfile:
          customBillExVat && Number(customBillExVat) > 0
            ? "FIXED_QUOTE"
            : project.billingProfile || fallbackTerms.billingProfile,
        feeRate:
          project.feeRate !== undefined && project.feeRate !== null
            ? Number(project.feeRate)
            : Number(fallbackTerms.feeRate),
        aitRate:
          project.aitRate !== undefined && project.aitRate !== null
            ? Number(project.aitRate)
            : Number(fallbackTerms.aitRate),
        vatRate:
          project.vatRate !== undefined && project.vatRate !== null
            ? Number(project.vatRate)
            : Number(fallbackTerms.vatRate ?? 0.15),
        fixedMonthlyBill: effectiveFixedBill,
        maintenanceBudget: project.maintenanceBudget ? Number(project.maintenanceBudget) : 0,
        monthlyAmortization: project.monthlyAmortization
          ? Number(project.monthlyAmortization)
          : 0,
      },
      billableCost: Number(billableCost || 0),
      imsInvestment: Number(imsInvestment || 0),
    });

    const recAmt = round2(receivedAmount || 0).toNumber();
    const totalCosts = round2(
      calc.billableCost +
        calc.imsInvestment +
        calc.maintenanceCost +
        calc.amortizationCost
    ).toNumber();
    const realizedNetProfit = round2(recAmt - totalCosts).toNumber();

    // Auto-calculate dueDate from submittedAt + billCycleDays if not explicitly provided
    let resolvedDueDate: Date | null = dueDate ? new Date(dueDate) : null;
    if (!resolvedDueDate && submittedAt) {
      const subDate = new Date(submittedAt);
      const cycleDays = project.billCycleDays ?? fallbackTerms.billCycleDays ?? 30;
      resolvedDueDate = new Date(subDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    }

    // Resolve status automatically if payment received
    let resolvedStatus = status || "BILL_SUBMITTED";
    if (recAmt > 0 && resolvedStatus !== "PAID" && resolvedStatus !== "PARTIAL_PAID") {
      resolvedStatus =
        recAmt >= calc.expectedInflow - 1 ? "PAID" : "PARTIAL_PAID";
    }

    const payload = {
      projectId,
      forMonth: forMonth || new Date().toISOString().slice(0, 7),
      billNumber: billNumber || null,
      poNumber: poNumber || null,
      status: resolvedStatus,
      billableCost: calc.billableCost,
      imsInvestment: calc.imsInvestment,
      billExVat: calc.billExVat,
      vatAmount: calc.vatAmount,
      billWithVat: calc.billWithVat,
      aitAmount: calc.aitDeducted,
      expectedInflow: calc.expectedInflow,
      receivedAmount: recAmt,
      accruedNetProfit: calc.netProfit,
      realizedNetProfit,
      poReceivedAt: poReceivedAt ? new Date(poReceivedAt) : null,
      grReceivedAt: grReceivedAt ? new Date(grReceivedAt) : null,
      submittedAt: submittedAt ? new Date(submittedAt) : null,
      dueDate: resolvedDueDate,
      receivedAt: receivedAt ? new Date(receivedAt) : recAmt > 0 ? new Date() : null,
      deviationReason: deviationReason || null,
      notes: notes || null,
      updatedById: user.id,
    };

    const record = id
      ? await (prisma as any).clientBill.update({
          where: { id },
          data: payload,
        })
      : await (prisma as any).clientBill.create({
          data: payload,
        });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: id ? "CLIENT_BILL_UPDATED" : "CLIENT_BILL_RECORDED",
        details: `${project.name} (${payload.forMonth}) — Bill With VAT: Tk ${calc.billWithVat}, Expected Inflow: Tk ${calc.expectedInflow}, Received: Tk ${recAmt}, Accrued P&L: Tk ${calc.netProfit} by ${user.name}`,
      },
    });

    return NextResponse.json(record);
  } catch (err: any) {
    console.error("Finance bill error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save client bill / payment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const canDelete =
      user.permissions.includes("req.accounts.check") ||
      user.permissions.includes("req.director") ||
      user.permissions.includes("req.md") ||
      user.permissions.includes("admin.users");

    if (!canDelete) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Bill ID required" }, { status: 400 });
    }

    await (prisma as any).clientBill.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
