import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calculateProfitSummary,
  getDefaultProjectTermsByCode,
  round2,
  extractProjectMeta,
  packCostHeadsWithMeta,
  resolveCostHeadsForKind,
  DirectExpenseItem,
} from "@/lib/profitEngine";

export const OPENING_BILL_PREFIX = "[OPENING_BALANCE]";

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

    const project: any = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project/Event not found" }, { status: 404 });
    }

    const isEvt =
      project.kind === "EVENT" || project.code?.toUpperCase().startsWith("EVT-");
    const costHeads = resolveCostHeadsForKind(project.costHeads, isEvt);
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

      // Readiness Check 1: No pending direct expenses in that month
      const pendingDirect = (meta.directExpenses || []).filter(
        (de) => de.forMonth === forMonth && de.status === "PENDING"
      );
      if (pendingDirect.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot close ${forMonth}: ${pendingDirect.length} pending Direct Expense(s) must be confirmed or rejected first.`,
          },
          { status: 400 }
        );
      }

      // Readiness Check 2: No unexecuted/open requisitions in that month
      const openReqs = await prisma.requisition.count({
        where: {
          projectId,
          forMonth,
          status: {
            notIn: ["EXECUTED", "SETTLED", "REJECTED", "CANCELLED", "DRAFT"],
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

      // Readiness Check 3: Either a bill exists for that month OR noBillReason is provided
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

    // ------------------------------------------------------------------------
    // ACTION 4: ADD / IMPORT / CONFIRM / REJECT DIRECT EXPENSES (Priority 2B)
    // ------------------------------------------------------------------------
    if (
      actionType === "ADD_DIRECT_EXPENSE" ||
      actionType === "IMPORT_DIRECT_EXPENSES" ||
      actionType === "REVIEW_DIRECT_EXPENSE"
    ) {
      const targetMonth = forMonth || new Date().toISOString().slice(0, 7);
      if (
        actionType !== "REVIEW_DIRECT_EXPENSE" &&
        meta.closedMonths &&
        meta.closedMonths[targetMonth]
      ) {
        return NextResponse.json(
          {
            error: `Month ${targetMonth} is closed and locked by Finance. Reopen the month first.`,
          },
          { status: 400 }
        );
      }

      const directExpenses: DirectExpenseItem[] = [...(meta.directExpenses || [])];

      if (actionType === "ADD_DIRECT_EXPENSE") {
        const amt = Number(body.amount || 0);
        if (amt <= 0) {
          return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
        }
        const matchedHead = costHeads.find(
          (ch) => ch.name.toLowerCase() === String(body.costHead || "").toLowerCase()
        );
        const newExp: DirectExpenseItem = {
          id: `de_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          forMonth: targetMonth,
          paidOn: body.paidOn || new Date().toISOString().slice(0, 10),
          costHead: body.costHead || costHeads[0]?.name || "General Expense",
          costTag: body.costTag || matchedHead?.tag || "BILLABLE",
          amount: amt,
          paidVia: body.paidVia || "Cash",
          note: String(body.note || "").trim(),
          status: isFinanceOrAdmin && body.autoConfirm ? "CONFIRMED" : "PENDING",
          createdBy: user.name,
          createdAt: new Date().toISOString().slice(0, 10),
          ...(isFinanceOrAdmin && body.autoConfirm
            ? { confirmedBy: user.name, confirmedAt: new Date().toISOString().slice(0, 10) }
            : {}),
        };
        directExpenses.unshift(newExp);
      } else if (actionType === "IMPORT_DIRECT_EXPENSES") {
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (rows.length === 0) {
          return NextResponse.json({ error: "No valid rows found in import" }, { status: 400 });
        }
        const batchId = `batch_${Date.now()}`;
        for (const r of rows) {
          const amt = Number(r.amount || 0);
          if (amt <= 0) continue;
          const rawHeadName = String(r.costHead || "").trim();
          const lower = rawHeadName.toLowerCase();
          // Match by exact name or alias
          const matched = costHeads.find(
            (ch) =>
              ch.name.toLowerCase() === lower ||
              (Array.isArray(ch.aliases) &&
                ch.aliases.some((al) => al.toLowerCase() === lower))
          );
          const rowMonth = r.forMonth || targetMonth;
          if (meta.closedMonths && meta.closedMonths[rowMonth]) {
            return NextResponse.json(
              { error: `Month ${rowMonth} is closed. Cannot import expenses into a closed month.` },
              { status: 400 }
            );
          }
          directExpenses.unshift({
            id: `de_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            forMonth: rowMonth,
            paidOn: r.paidOn || new Date().toISOString().slice(0, 10),
            costHead: matched ? matched.name : rawHeadName || "Imported Expense",
            costTag:
              r.costTag === "IMS_INVESTMENT"
                ? "IMS_INVESTMENT"
                : matched?.tag || "BILLABLE",
            amount: amt,
            paidVia: r.paidVia || "Bank",
            note: String(r.note || "Imported from Excel/CSV").trim(),
            status: isFinanceOrAdmin && body.autoConfirm ? "CONFIRMED" : "PENDING",
            createdBy: user.name,
            createdAt: new Date().toISOString().slice(0, 10),
            batchId,
            ...(isFinanceOrAdmin && body.autoConfirm
              ? { confirmedBy: user.name, confirmedAt: new Date().toISOString().slice(0, 10) }
              : {}),
          });
        }
      } else if (actionType === "REVIEW_DIRECT_EXPENSE") {
        if (!isFinanceOrAdmin) {
          return NextResponse.json(
            { error: "Only Finance or Admin can confirm or reject Direct Expenses." },
            { status: 403 }
          );
        }
        const expId = body.expenseId;
        const decision = body.decision as "CONFIRMED" | "REJECTED" | "DELETE";
        if (decision === "REJECTED" && !String(body.rejectReason || "").trim()) {
          return NextResponse.json(
            { error: "A rejection reason is required when rejecting a Direct Expense." },
            { status: 400 }
          );
        }
        const idx = directExpenses.findIndex((d) => d.id === expId);
        if (idx === -1) {
          return NextResponse.json({ error: "Direct Expense not found" }, { status: 404 });
        }
        if (decision === "DELETE") {
          directExpenses.splice(idx, 1);
        } else {
          directExpenses[idx] = {
            ...directExpenses[idx],
            status: decision,
            confirmedBy: user.name,
            confirmedAt: new Date().toISOString().slice(0, 10),
            ...(decision === "REJECTED"
              ? { rejectReason: String(body.rejectReason).trim() }
              : {}),
          };
        }
      }

      const packed = packCostHeadsWithMeta(costHeads, {
        ...meta,
        directExpenses,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: { costHeads: packed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: actionType,
          details: `Direct expense action (${actionType}) on ${project.name} by ${user.name}`,
        },
      });

      return NextResponse.json({ success: true, directExpenses });
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

    // Opening-balance bills (Priority 1C: isOpeningBalance) count in Receivables & Overdue Ageing ONLY, excluded from current-year P&L
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
      const cycleDays = project.billCycleDays ?? fallbackTerms.billCycleDays ?? 30;
      resolvedDueDate = new Date(subDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    }

    // Resolve status automatically if payment received (with ±10 BDT rounding tolerance per §4.4)
    let resolvedStatus = status || "SUBMITTED";
    if (recAmt > 0 && finalExpectedInflow > 0 && recAmt >= finalExpectedInflow - 10) {
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
