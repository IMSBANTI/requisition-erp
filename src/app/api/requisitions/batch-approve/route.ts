import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser, verifySecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!user.permissions.includes("req.md")) {
      return NextResponse.json({ error: "Only the Managing Director can batch approve" }, { status: 403 });
    }

    const { ids, pinOrPassword, comment } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No requisitions selected" }, { status: 400 });
    }

    // Authenticate PIN or password
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

    const ip = await clientIp();

    const requisitions = await prisma.requisition.findMany({
      where: { id: { in: ids } },
    });

    for (const req of requisitions) {
      const docHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ id: req.id, number: req.number, total: req.total.toString(), date: req.date }))
        .digest("hex");

      await prisma.$transaction([
        prisma.approval.create({
          data: {
            requisitionId: req.id,
            step: "MD",
            action: "APPROVED",
            userId: user.id,
            signerName: user.name,
            signerDesignation: user.designation,
            signature: user.signature,
            comment: comment || "Managing Director Batch Approval",
            batch: true,
            docHash,
            ip,
          },
        }),
        prisma.requisition.update({
          where: { id: req.id },
          data: {
            mdStatus: "APPROVED",
            // If it was waiting in PENDING_MD, advance status to APPROVED
            status: req.status === "PENDING_MD" ? "APPROVED" : req.status,
            currentAssigneeId: null,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: user.id,
            requisitionId: req.id,
            action: "MD_BATCH_APPROVED",
            details: `Approved in batch by Managing Director ${user.name}`,
            ip,
          },
        }),
      ]);
    }

    return NextResponse.json({ success: true, count: requisitions.length });
  } catch (err: any) {
    console.error("Batch approve error:", err);
    return NextResponse.json({ error: err.message || "Failed to batch approve" }, { status: 500 });
  }
}
