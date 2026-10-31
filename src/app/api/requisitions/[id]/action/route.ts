import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser, verifySecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stateAfter, STATUS_STEP, ChainStep } from "@/lib/workflow";
import { amountInWords } from "@/lib/numberToWords";
import { grandTotal } from "@/lib/money";
import { createNotification, notifyUsers, findUsersWithPermission } from "@/lib/notifications";

function resolveSignerBoxStep(user: { permissions: string[] }, currentStep?: string) {
  if (user.permissions.includes("req.md")) return "MD";
  if (user.permissions.includes("req.director")) return "DIRECTOR";
  if (user.permissions.includes("req.accounts.check")) return "ACCOUNTS";
  if (currentStep === "CHECKER" || user.permissions.includes("req.approve.it")) return "CHECKER";
  return currentStep || "HEAD";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const {
      action,
      comment,
      pinOrPassword,
      forwardToId,
      targetDirectorId,
      signatureDataUrl,
      adjustedItems,
    } = await request.json();

    // Authenticate user's PIN or password
    let authenticated = false;
    const cleanPin = String(pinOrPassword || "").trim();
    if (user.pinHash) {
      authenticated = await verifySecret(cleanPin, user.pinHash);
    }
    if (!authenticated) {
      authenticated = await verifySecret(cleanPin, user.passwordHash);
    }
    if (!authenticated && user.mustChangePassword) {
      authenticated =
        cleanPin.toLowerCase() === user.email.toLowerCase() ||
        cleanPin === "Ims@12345" ||
        (user.email.includes("officestuff@ims.net.bd") &&
          cleanPin.toLowerCase() === "officestuff@ims.net.bd");
    }
    if (!authenticated) {
      return NextResponse.json(
        { error: "Incorrect 4-digit PIN or login password (default: your email)" },
        { status: 401 }
      );
    }

    // If user drew a new signature on the spot, save it to their profile and use it
    let activeSignature = user.signature;
    if (signatureDataUrl && typeof signatureDataUrl === "string" && signatureDataUrl.startsWith("data:image/")) {
      activeSignature = signatureDataUrl;
      await prisma.user.update({
        where: { id: user.id },
        data: { signature: signatureDataUrl },
      });
    }

    const req = await prisma.requisition.findUnique({
      where: { id },
      include: { project: true, company: true, approvals: true, items: true },
    });

    if (!req) {
      return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
    }

    const ip = await clientIp();
    const currentStep = STATUS_STEP[req.status];
    const chain = (req.chain as unknown as ChainStep[]) || [];
    const signerStep = resolveSignerBoxStep(user, currentStep);

    // Handle "Approve Lower Amount" line adjustments if provided by Approver
    let reductionSummary = "";
    if (Array.isArray(adjustedItems) && adjustedItems.length > 0) {
      if (!comment || !String(comment).trim()) {
        return NextResponse.json(
          { error: "A comment/reason is mandatory when approving a lower amount." },
          { status: 400 }
        );
      }
      let newBillable = 0;
      let newImsInv = 0;
      const updatedForTotal: Array<{ qty: number; unitPrice: number }> = [];

      for (const existingItem of req.items) {
        const adj = adjustedItems.find((a: any) => a.id === existingItem.id);
        const newUnitPrice =
          adj && adj.unitPrice !== undefined
            ? Math.min(Number(existingItem.unitPrice), Math.max(0, Number(adj.unitPrice)))
            : Number(existingItem.unitPrice);
        const qtyNum = Number(existingItem.qty);
        const lineAmt = qtyNum * newUnitPrice;
        updatedForTotal.push({ qty: qtyNum, unitPrice: newUnitPrice });

        if ((existingItem as any).costTag === "IMS_INVESTMENT") {
          newImsInv += lineAmt;
        } else {
          newBillable += lineAmt;
        }

        if (newUnitPrice !== Number(existingItem.unitPrice)) {
          await prisma.requisitionItem.update({
            where: { id: existingItem.id },
            data: {
              unitPrice: newUnitPrice,
              amount: lineAmt,
            },
          });
        }
      }

      const newTotal = grandTotal(updatedForTotal);
      if (newTotal.toNumber() < Number(req.total)) {
        reductionSummary = ` [Approved Lower Amount: Tk ${newTotal.toFixed(2)} reduced from Tk ${Number(req.total).toFixed(2)}]`;
        await prisma.requisition.update({
          where: { id: req.id },
          data: {
            total: newTotal.toNumber(),
            billableTotal: newBillable,
            imsInvestmentTotal: newImsInv,
            amountInWords: amountInWords(newTotal),
          },
        });
      }
    }

    // Document hash for digital signature audit
    const docHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ id: req.id, number: req.number, total: req.total.toString(), date: req.date }))
      .digest("hex");

    // 1. Standard Next-Step Approve
    if (action === "APPROVE") {
      const nextIndex = req.stepIndex + 1;
      const nextWorkflow = stateAfter(chain, nextIndex, req.project.releaseBeforeMd);

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: (comment || "Approved and digitally signed") + reductionSummary,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            stepIndex: nextIndex,
            status: nextWorkflow.status,
            currentAssigneeId: nextWorkflow.assigneeId,
            mdStatus: nextWorkflow.mdStatus,
            approvedAt: nextWorkflow.status === "APPROVED" ? new Date() : undefined,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: `APPROVED_${signerStep}`,
            details: `Approved by ${user.name} (${user.designation}). Next status: ${nextWorkflow.status}`,
            ip,
          },
        }),
      ]);

      if (nextWorkflow.assigneeId) {
        await createNotification({
          userId: nextWorkflow.assigneeId,
          message: `Requisition ${req.number || req.id} (${req.project.name}) was approved by ${user.name} and requires your approval.`,
          link: `/requisitions/${req.id}`,
        });
      } else if (nextWorkflow.status === "PENDING_ACCOUNTS") {
        const accountsUserIds = await findUsersWithPermission("req.accounts.check");
        await notifyUsers({
          userIds: accountsUserIds,
          message: `Requisition ${req.number || req.id} (${req.project.name}) requires Accounts vetting.`,
          link: `/requisitions/${req.id}`,
        });
      } else if (nextWorkflow.status === "PENDING_MD") {
        const mdUserIds = await findUsersWithPermission("req.md");
        await notifyUsers({
          userIds: mdUserIds,
          message: `Requisition ${req.number || req.id} (${req.project.name}) requires MD approval.`,
          link: `/requisitions/${req.id}`,
        });
      } else if (nextWorkflow.status === "APPROVED") {
        const accountsUserIds = await findUsersWithPermission("req.forward");
        await notifyUsers({
          userIds: accountsUserIds,
          message: `Requisition ${req.number || req.id} (${req.project.name}) is approved by management and ready for Accounts payment/execution.`,
          link: `/requisitions/${req.id}`,
        });
      }

      if (req.makerId !== user.id) {
        await createNotification({
          userId: req.makerId,
          message: `Your requisition ${req.number || req.id} was approved by ${user.name} (${user.designation}).`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: nextWorkflow.status });
    }

    // 2. Sign & Send to Accounts (from Manager, Director, or MD)
    if (action === "APPROVE_TO_ACCOUNTS") {
      const isDirectorOrMd =
        user.permissions.includes("req.director") || user.permissions.includes("req.md");
      const accountsAlreadySigned = req.approvals.some((a) => a.step === "ACCOUNTS");
      const nextStatus = isDirectorOrMd && accountsAlreadySigned ? "APPROVED" : "PENDING_ACCOUNTS";
      const nextMdStatus = user.permissions.includes("req.md") ? "APPROVED" : req.mdStatus;

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: (comment || "Approved and sent to Accounts") + reductionSummary,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: nextStatus,
            currentAssigneeId: null,
            mdStatus: nextMdStatus,
            approvedAt: isDirectorOrMd ? new Date() : undefined,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: `SIGNED_${signerStep}_TO_ACCOUNTS`,
            details: `${user.name} (${user.designation}) signed ${signerStep} and sent to Accounts (${nextStatus})`,
            ip,
          },
        }),
      ]);

      const accountsUserIds = await findUsersWithPermission("req.accounts.check");
      await notifyUsers({
        userIds: accountsUserIds,
        message: `Requisition ${req.number || req.id} (${req.project.name}) was signed by ${user.name} and sent to Accounts.`,
        link: `/requisitions/${req.id}`,
      });

      if (req.makerId !== user.id) {
        await createNotification({
          userId: req.makerId,
          message: `Your requisition ${req.number || req.id} was approved by ${user.name} and sent to Accounts.`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: nextStatus });
    }

    // 3. Sign & Send to Director (from Manager / Head or Accounts Manager)
    if (action === "APPROVE_TO_DIRECTOR") {
      let resolvedDirectorId = targetDirectorId || req.project.directorId || null;
      if (!resolvedDirectorId) {
        const catDir = await prisma.user.findFirst({
          where: {
            role: { permissions: { has: "req.director" } },
            active: true,
          },
          orderBy: { employeeId: "asc" },
        });
        resolvedDirectorId = catDir?.id || null;
      }

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: (comment || "Signed and forwarded to Director for approval") + reductionSummary,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "PENDING_DIRECTOR",
            currentAssigneeId: resolvedDirectorId,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: `SIGNED_${signerStep}_TO_DIRECTOR`,
            details: `${user.name} (${user.designation}) signed ${signerStep} and routed to Director`,
            ip,
          },
        }),
      ]);

      if (resolvedDirectorId) {
        await createNotification({
          userId: resolvedDirectorId,
          message: `Requisition ${req.number || req.id} (${req.project.name}) was signed by ${user.name} and requires your Director approval.`,
          link: `/requisitions/${req.id}`,
        });
      } else {
        const dirUserIds = await findUsersWithPermission("req.director");
        await notifyUsers({
          userIds: dirUserIds,
          message: `Requisition ${req.number || req.id} (${req.project.name}) requires Director approval.`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: "PENDING_DIRECTOR" });
    }

    // 4. Sign & Forward to Managing Director (MD) for further approval
    if (action === "APPROVE_TO_MD") {
      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: (comment || "Signed and forwarded to Managing Director (MD) for further approval") + reductionSummary,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "PENDING_MD",
            currentAssigneeId: null,
            mdStatus: "PENDING",
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: `FORWARDED_TO_MD_BY_${signerStep}`,
            details: `${user.name} (${user.designation}) signed ${signerStep} and forwarded to MD for further approval`,
            ip,
          },
        }),
      ]);

      const mdUserIds = await findUsersWithPermission("req.md");
      await notifyUsers({
        userIds: mdUserIds,
        message: `Requisition ${req.number || req.id} (${req.project.name}) was signed by ${user.name} and forwarded to MD for approval.`,
        link: `/requisitions/${req.id}`,
      });

      return NextResponse.json({ success: true, status: "PENDING_MD" });
    }

    // 5. Forward to Accounts Executive for payment/disbursement
    if (action === "FORWARD") {
      if (!user.permissions.includes("req.forward") && !user.permissions.includes("req.accounts.check")) {
        return NextResponse.json({ error: "Unauthorized to forward" }, { status: 403 });
      }

      const accountsAlreadySigned = req.approvals.some((a) => a.step === "ACCOUNTS");
      const txOps: any[] = [];

      if (!accountsAlreadySigned) {
        txOps.push(
          prisma.approval.create({
            data: {
              requisitionId: req.id,
              step: "ACCOUNTS",
              action: "APPROVED",
              userId: user.id,
              signerName: user.name,
              signerDesignation: user.designation,
              signature: activeSignature,
              comment: comment || "Checked by Accounts",
              docHash,
              ip,
            },
          })
        );
      }

      txOps.push(
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: "FORWARD",
            action: "FORWARDED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: comment || "Forwarded to Accounts Executive for payment/disbursement",
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "FORWARDED",
            executorId: forwardToId,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "FORWARDED_TO_ACCOUNTS_EXECUTIVE",
            details: `Signed by Accounts & forwarded by ${user.name} for disbursement`,
            ip,
          },
        })
      );

      await prisma.$transaction(txOps);

      if (forwardToId) {
        await createNotification({
          userId: forwardToId,
          message: `Requisition ${req.number || req.id} was signed by Accounts (${user.name}) and assigned to you to pay/disburse.`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: "FORWARDED" });
    }

    // 6. Execute / Pay the Money (Accounts Executive or Accounts Manager)
    if (action === "EXECUTE") {
      const canExecute =
        user.permissions.includes("req.execute") ||
        user.permissions.includes("req.accounts.check") ||
        user.permissions.includes("req.forward");

      if (!canExecute) {
        return NextResponse.json({ error: "Unauthorized to execute/disburse payment" }, { status: 403 });
      }

      const accountsAlreadySigned = req.approvals.some((a) => a.step === "ACCOUNTS");
      const txOps: any[] = [];

      if (!accountsAlreadySigned) {
        txOps.push(
          prisma.approval.create({
            data: {
              requisitionId: req.id,
              step: "ACCOUNTS",
              action: "APPROVED",
              userId: user.id,
              signerName: user.name,
              signerDesignation: user.designation,
              signature: activeSignature,
              comment: "Checked & Signed by Accounts",
              docHash,
              ip,
            },
          })
        );
      }

      txOps.push(
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: "EXECUTION",
            action: "EXECUTED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment: comment || "Payment executed and money disbursed by Accounts",
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "EXECUTED",
            executorId: user.id,
            executedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "EXECUTED_DISBURSED",
            details: `Money paid / disbursed by Accounts (${user.name})`,
            ip,
          },
        })
      );

      await prisma.$transaction(txOps);

      await createNotification({
        userId: req.makerId,
        message: `Your requisition ${req.number || req.id} (Tk ${req.total}) has been signed by Accounts and paid/disbursed by ${user.name}.`,
        link: `/requisitions/${req.id}`,
      });

      return NextResponse.json({ success: true, status: "EXECUTED" });
    }

    if (action === "RETURN") {
      if (!comment) {
        return NextResponse.json({ error: "Reason is required to return a requisition" }, { status: 400 });
      }

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "RETURNED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "RETURNED",
            currentAssigneeId: req.makerId,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "RETURNED_FOR_CORRECTION",
            details: `Returned by ${user.name}: "${comment}"`,
            ip,
          },
        }),
      ]);

      await createNotification({
        userId: req.makerId,
        message: `Your requisition ${req.number || req.id} was returned for correction by ${user.name}: "${comment}"`,
        link: `/requisitions/${req.id}`,
      });

      return NextResponse.json({ success: true, status: "RETURNED" });
    }

    if (action === "REJECT") {
      if (!comment) {
        return NextResponse.json({ error: "Reason is required to reject a requisition" }, { status: 400 });
      }

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: signerStep,
            action: "REJECTED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: activeSignature,
            comment,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "REJECTED",
            currentAssigneeId: null,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "REJECTED",
            details: `Rejected by ${user.name}: "${comment}"`,
            ip,
          },
        }),
      ]);

      await createNotification({
        userId: req.makerId,
        message: `Your requisition ${req.number || req.id} was rejected by ${user.name}: "${comment}"`,
        link: `/requisitions/${req.id}`,
      });

      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    if (action === "DELETE") {
      const isAdminOrHighLevel =
        user.permissions.includes("admin.users") ||
        user.permissions.includes("req.md") ||
        user.permissions.includes("req.director") ||
        user.permissions.includes("req.accounts.check");
      const isMakerBeforeExecution = req.makerId === user.id && req.status !== "EXECUTED";

      if (!isAdminOrHighLevel && !isMakerBeforeExecution) {
        return NextResponse.json(
          { error: "Only the creator (before payment) or Admin/Management can delete a requisition." },
          { status: 403 }
        );
      }

      const deletedNumber = req.number || "Draft";
      const deletedTotal = req.total.toString();
      const deletedProject = req.project.name;

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "REQUISITION_DELETED",
          details: `Requisition ${deletedNumber} (${deletedProject}, Tk ${deletedTotal}) created by ${req.makerName} was permanently deleted by ${user.name}${comment ? `: "${comment}"` : ""}`,
          ip,
        },
      });

      await prisma.requisition.delete({
        where: { id: req.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Requisition ${deletedNumber} has been permanently deleted.`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Action error:", err);
    return NextResponse.json({ error: err.message || "Failed to process action" }, { status: 500 });
  }
}
