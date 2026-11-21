import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessFinancialReports,
  financialReportProjectScope,
} from "@/lib/rbac";
import {
  calculateProfitSummary,
  round2,
  extractProjectMeta,
  packCostHeadsWithMeta,
  resolveCostHeadsForKind,
} from "@/lib/profitEngine";
import {
  OPENING_BILL_PREFIX,
  PAYMENT_TOLERANCE_BDT,
  resolveEffectiveProjectTerms,
} from "@/lib/financeMetrics";

function canManageFinanceBills(user: Awaited<ReturnType<typeof requireUser>>): boolean {
  return (
    canAccessFinancialReports(user) &&
    (user.permissions.includes("req.accounts.check") ||
      user.permissions.includes("req.execute") ||
      user.permissions.includes("req.director") ||
      user.permissions.includes("req.md") ||
      user.permissions.includes("admin.users") ||
      user.permissions.includes("project.manage") ||
      Boolean(user.role.isManager))
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!canManageFinanceBills(user)) {
      return NextResponse.json(
        { error: "Unauthorized to record client bills or finance actions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      actionType,
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
      isOpeningBalance,
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Project or Event is required" }, { status: 400 });
    }

    const project: any = await prisma.project.findFirst({
      where: {
        AND: [{ id: projectId }, financialReportProjectScope(user)],
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project/Event not found or you do not have report access to this project." },
        { status: 403 }
      );
    }

    const isEvt =
      project.kind === "EVENT" || project.code?.toUpperCase().startsWith("EVT-");
    const costHeads = resolveCostHeadsForKind(project.costHeads, isEvt, project.code);
    const meta = extractProjectMeta(project.costHeads);

    const isFinanceOrAdmin =
      user.permissions.includes("req.accounts.check") ||
      user.permissions.includes("req.execute") ||
      user.permissions.includes("req.director") ||
      user.permissions.includes("req.md") ||
      user.permissions.includes("admin.users") ||
      user.permissions.includes("project.manage");

    // ------------------------------------------------------------------------
    // ACTION 1: CLOSE MONTH (Priority 1B — close_month readiness + lock)
    // ------------------------------------------------------------------------
    if (actionType === "CLOSE_MONTH") {
      if (!isFinanceOrAdmin) {
        return NextResponse.json(
          { error: "Only Finance or Admin can close a project month." },
          { status: 403 }
        );
      }
      if (!forMonth) {
        return NextResponse.json({ error: "Month (YYYY-MM) is required" }, { status: 400 });
      }

      // Readiness Check 1: No unexecuted/open requisitions in that month
      const openReqs = await prisma.requisition.count({
        where: {
          projectId,
          forMonth,
          status: {
            notIn: ["EXECUTED", "SETTLED", "REJECTED", "CANCELLED", "DRAFT", "RETURNED"],
          },
        },
      });
      if (openReqs > 0) {
        return NextResponse.json(
          {
            error: `Cannot close ${forMonth}: ${openReqs} requisition(s) for this month are still pending approval or disbursement. Execute or settle them first.`,
          },
          { status: 400 }
        );
      }

      // Readiness Check 2: Either a bill exists for that month OR noBillReason is provided
      const billCount = await (prisma as any).clientBill.count({
        where: { projectId, forMonth },
      });
      const noBillReason = String(body.noBillReason || "").trim();
      if (billCount === 0 && !noBillReason) {
        return NextResponse.json(
          {
            error: `No Client Bill recorded for ${forMonth}. Please record a bill or provide a No-Bill Reason to close this month.`,
          },
          { status: 400 }
        );
      }

      const closedMonths = { ...(meta.closedMonths || {}) };
      closedMonths[forMonth] = {
        closedAt: new Date().toISOString(),
        closedBy: user.name,
        ...(noBillReason ? { noBillReason } : {}),
        reopenHistory: closedMonths[forMonth]?.reopenHistory || [],
      };

      const packed = packCostHeadsWithMeta(costHeads, {
        ...meta,
        closedMonths,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { costHeads: packed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "MONTH_CLOSED",
          details: `Project ${project.name} (${project.code}) month ${forMonth} closed by ${user.name}${noBillReason ? ` (No-bill reason: ${noBillReason})` : ""}`,
        },
      });

      return NextResponse.json({ success: true, closedMonths });
    }

    // ------------------------------------------------------------------------
    // ACTION 2: REOPEN MONTH (Priority 1B — reopen_month with mandatory reason)
    // ------------------------------------------------------------------------
    if (actionType === "REOPEN_MONTH") {
      if (!isFinanceOrAdmin) {
        return NextResponse.json(
          { error: "Only Finance or Admin can reopen a closed month." },
          { status: 403 }
        );
      }
      const reopenReason = String(body.reason || "").trim();
      if (!forMonth || !reopenReason) {
        return NextResponse.json(
          { error: "Month and a mandatory Reopen Reason are required." },
          { status: 400 }
        );
      }

      const closedMonths = { ...(meta.closedMonths || {}) };
      delete closedMonths[forMonth];

      const packed = packCostHeadsWithMeta(costHeads, {
        ...meta,
        closedMonths,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { costHeads: packed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "MONTH_REOPENED",
          details: `Project ${project.name} (${project.code}) month ${forMonth} reopened by ${user.name}. Reason: "${reopenReason}"`,
        },
      });

      return NextResponse.json({ success: true, closedMonths });
    }

    // ------------------------------------------------------------------------
    // ACTION 3: MANUAL FORECAST OVERRIDE (Priority 1C)
    // ------------------------------------------------------------------------
    if (actionType === "SET_FORECAST") {
      if (!forMonth) {
        return NextResponse.json({ error: "Target month is required" }, { status: 400 });
      }
      const manualForecasts = { ...(meta.manualForecasts || {}) };
      if (body.clearOverride) {
        delete manualForecasts[forMonth];
      } else {
        const amt = Number(body.manualNetProfit);
        if (isNaN(amt)) {
          return NextResponse.json({ error: "Valid forecast amount is required" }, { status: 400 });
        }
        manualForecasts[forMonth] = {
          amount: amt,
          note: String(body.manualNote || "Manual forecast override").trim(),
          updatedBy: user.name,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
      }

      const packed = packCostHeadsWithMeta(costHeads, {
        ...meta,
        manualForecasts,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { costHeads: packed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: body.clearOverride ? "FORECAST_OVERRIDE_CLEARED" : "FORECAST_OVERRIDE_SET",
          details: `Project ${project.name} (${forMonth}) forecast override ${
            body.clearOverride ? "reverted to Auto" : `set to Tk ${body.manualNetProfit}`
          } by ${user.name}`,
        },
      });

      return NextResponse.json({ success: true, manualForecasts });
    }

    if (
      actionType === "ADD_DIRECT_EXPENSE" ||
      actionType === "IMPORT_DIRECT_EXPENSES" ||
      actionType === "REVIEW_DIRECT_EXPENSE"
    ) {
      return NextResponse.json(
        {
          error:
            "Direct Expenses have been retired. Please record project costs via New Requisition (which supports Excel/CSV import).",
        },
        { status: 410 }
      );
    }

    // ------------------------------------------------------------------------
    // DEFAULT ACTION: RECORD OR UPDATE CLIENT BILL / PAYMENT
    // ------------------------------------------------------------------------
    const targetBillMonth = forMonth || new Date().toISOString().slice(0, 7);
    if (meta.closedMonths && meta.closedMonths[targetBillMonth]) {
      return NextResponse.json(
        {
          error: `Month ${targetBillMonth} is closed and locked for ${project.name}. Reopen the month before creating or editing bills.`,
        },
        { status: 400 }
      );
    }

    const effectiveTerms = resolveEffectiveProjectTerms(project);
    const hasCustomBill =
      customBillExVat !== undefined &&
      customBillExVat !== "" &&
      Number(customBillExVat) > 0;

    const calc = calculateProfitSummary({
      terms: {
        ...effectiveTerms,
        billingProfile: hasCustomBill ? "FIXED_QUOTE" : effectiveTerms.billingProfile,
        fixedMonthlyBill: hasCustomBill
          ? Number(customBillExVat)
          : effectiveTerms.fixedMonthlyBill,
      },
      billableCost: Number(billableCost || 0),
      imsInvestment: Number(imsInvestment || 0),
    });

    const finalBillExVat =
      body.billExVat !== undefined && body.billExVat !== ""
        ? round2(body.billExVat).toNumber()
        : calc.billExVat;
    const finalVatAmt =
      body.vatAmount !== undefined && body.vatAmount !== ""
        ? round2(body.vatAmount).toNumber()
        : calc.vatAmount;
    const finalAitAmt =
      body.aitAmount !== undefined && body.aitAmount !== ""
        ? round2(body.aitAmount).toNumber()
        : calc.aitDeducted;
    const finalBillWithVat = round2(finalBillExVat + finalVatAmt).toNumber();
    const finalExpectedInflow = round2(finalBillExVat - finalAitAmt).toNumber();

    const recAmt = round2(receivedAmount || 0).toNumber();
    const totalCosts = round2(
      calc.billableCost +
        calc.imsInvestment +
        calc.maintenanceCost +
        calc.amortizationCost
    ).toNumber();

    // Opening-balance bills count in Receivables & Overdue Ageing ONLY, excluded from current-year P&L
    const openingFlag =
      Boolean(isOpeningBalance) ||
      String(notes || "").startsWith(OPENING_BILL_PREFIX);
    const cleanNotes = String(notes || "")
      .replace(OPENING_BILL_PREFIX, "")
      .trim();
    const storedNotes = openingFlag
      ? `${OPENING_BILL_PREFIX} ${cleanNotes}`.trim()
      : cleanNotes || null;

    const accruedNetProfit = openingFlag
      ? 0
      : round2(finalExpectedInflow - totalCosts).toNumber();
    const realizedNetProfit = openingFlag
      ? 0
      : round2(recAmt - totalCosts).toNumber();

    // Auto-calculate dueDate from submittedAt + billCycleDays if not explicitly provided
    let resolvedDueDate: Date | null = dueDate ? new Date(dueDate) : null;
    if (!resolvedDueDate && submittedAt) {
      const subDate = new Date(submittedAt);
      const cycleDays = effectiveTerms.billCycleDays ?? 30;
      resolvedDueDate = new Date(subDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    }

    // Resolve status automatically if payment received (with ±10 BDT rounding tolerance per §4.4)
    let resolvedStatus = status || "SUBMITTED";
    if (
      recAmt > 0 &&
      finalExpectedInflow > 0 &&
      recAmt >= finalExpectedInflow - PAYMENT_TOLERANCE_BDT
    ) {
      resolvedStatus = "PAID";
    } else if (recAmt > 0 && resolvedStatus !== "PAID" && resolvedStatus !== "PARTIAL_PAID") {
      resolvedStatus = "PARTIAL_PAID";
    }

    const payload = {
      projectId,
      forMonth: targetBillMonth,
      billNumber: billNumber || null,
      poNumber: poNumber || null,
      status: resolvedStatus,
      billableCost: openingFlag ? 0 : calc.billableCost,
      imsInvestment: openingFlag ? 0 : calc.imsInvestment,
      billExVat: finalBillExVat,
      vatAmount: finalVatAmt,
      billWithVat: finalBillWithVat,
      aitAmount: finalAitAmt,
      expectedInflow: finalExpectedInflow,
      receivedAmount: recAmt,
      accruedNetProfit,
      realizedNetProfit,
      poReceivedAt: poReceivedAt ? new Date(poReceivedAt) : null,
      grReceivedAt: grReceivedAt ? new Date(grReceivedAt) : null,
      submittedAt: submittedAt ? new Date(submittedAt) : null,
      dueDate: resolvedDueDate,
      receivedAt: receivedAt ? new Date(receivedAt) : recAmt > 0 ? new Date() : null,
      deviationReason: deviationReason || null,
      notes: storedNotes,
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
        details: `${project.name} (${payload.forMonth})${openingFlag ? " [OPENING BALANCE]" : ""} — Bill With VAT: Tk ${finalBillWithVat}, Expected Inflow: Tk ${finalExpectedInflow}, Received: Tk ${recAmt}, Accrued P&L: Tk ${accruedNetProfit} by ${user.name}`,
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
    if (!canManageFinanceBills(user)) {
      return NextResponse.json(
        { error: "Unauthorized to delete client bills or payment records" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Bill ID required" }, { status: 400 });
    }

    const existingBill = await (prisma as any).clientBill.findFirst({
      where: {
        id,
        project: financialReportProjectScope(user),
      },
      include: { project: { select: { name: true } } },
    });
    if (!existingBill) {
      return NextResponse.json(
        { error: "Bill not found or access denied for this project" },
        { status: 403 }
      );
    }

    await (prisma as any).clientBill.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CLIENT_BILL_DELETED",
        details: `${existingBill.project?.name || existingBill.projectId} (${existingBill.forMonth}) — Deleted bill ${existingBill.billNumber || id} (Received Tk ${existingBill.receivedAmount}) by ${user.name}`,
      },
    });
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
