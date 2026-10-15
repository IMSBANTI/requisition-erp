import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser, verifySecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stateAfter, STATUS_STEP, ChainStep } from "@/lib/workflow";
import { createNotification, notifyUsers, findUsersWithPermission } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action, comment, pinOrPassword, forwardToId } = await request.json();

    // Authenticate user's PIN or password
    let authenticated = false;
    if (user.pinHash) {
      authenticated = await verifySecret(pinOrPassword, user.pinHash);
    }
    if (!authenticated) {
      authenticated = await verifySecret(pinOrPassword, user.passwordHash);
    }
    if (!authenticated) {
      return NextResponse.json({ error: "Incorrect 4-digit PIN or password" }, { status: 401 });
    }

    const req = await prisma.requisition.findUnique({
      where: { id },
      include: { project: true, company: true },
    });

    if (!req) {
      return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
    }

    const ip = await clientIp();
    const currentStep = STATUS_STEP[req.status];
    const chain = (req.chain as unknown as ChainStep[]) || [];

    // Document hash for digital signature audit
    const docHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ id: req.id, number: req.number, total: req.total.toString(), date: req.date }))
      .digest("hex");

    if (action === "APPROVE") {
      const nextIndex = req.stepIndex + 1;
      const nextWorkflow = stateAfter(chain, nextIndex, req.project.releaseBeforeMd);

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: currentStep || "APPROVAL",
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
            comment,
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
            action: `APPROVED_${currentStep || "STEP"}`,
            details: `Approved by ${user.name} (${user.designation}). Next status: ${nextWorkflow.status}`,
            ip,
          },
        }),
      ]);

      // Notify next approver and maker
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
          message: `Requisition ${req.number || req.id} (${req.project.name}) is fully approved by management and ready to forward/execute.`,
          link: `/requisitions/${req.id}`,
        });
      }

      // Notify maker of approval
      if (req.makerId !== user.id) {
        await createNotification({
          userId: req.makerId,
          message: `Your requisition ${req.number || req.id} was approved by ${user.name} (${user.designation}). Next status: ${nextWorkflow.status}.`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: nextWorkflow.status });
    }

    if (action === "FORWARD") {
      if (!user.permissions.includes("req.forward")) {
        return NextResponse.json({ error: "Unauthorized to forward" }, { status: 403 });
      }

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: "FORWARD",
            action: "FORWARDED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
            comment: comment || "Forwarded to Accounts Executive for execution",
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
            details: `Forwarded by Accounts Manager ${user.name}`,
            ip,
          },
        }),
      ]);

      if (forwardToId) {
        await createNotification({
          userId: forwardToId,
          message: `Requisition ${req.number || req.id} was forwarded to you by Accounts Manager ${user.name} for execution/disbursement.`,
          link: `/requisitions/${req.id}`,
        });
      }

      return NextResponse.json({ success: true, status: "FORWARDED" });
    }

    if (action === "EXECUTE") {
      if (!user.permissions.includes("req.execute") || req.executorId !== user.id) {
        return NextResponse.json({ error: "Unauthorized to execute this requisition" }, { status: 403 });
      }

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: "EXECUTION",
            action: "EXECUTED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
            comment: comment || "Payment executed and disbursed",
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            status: "EXECUTED",
            executedAt: new Date(),
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "EXECUTED_DISBURSED",
            details: `Funds disbursed by Accounts Executive ${user.name}`,
            ip,
          },
        }),
      ]);

      await createNotification({
        userId: req.makerId,
        message: `Your requisition ${req.number || req.id} (Tk ${req.total}) has been disbursed / executed by ${user.name}.`,
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
            step: currentStep || "REVIEW",
            action: "RETURNED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
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
            step: currentStep || "REVIEW",
            action: "REJECTED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Action error:", err);
    return NextResponse.json({ error: err.message || "Failed to process action" }, { status: 500 });
  }
}
