import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser, verifySecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveChain, stateAfter } from "@/lib/workflow";
import { generateRequisitionNumber } from "@/lib/reqNumber";
import { amountInWords } from "@/lib/numberToWords";
import { grandTotal } from "@/lib/money";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();

    const projectId = formData.get("projectId") as string;
    const companyId = formData.get("companyId") as string;
    const type = (formData.get("type") as string) || "BPO";
    const category = (formData.get("category") as string) || "GENERAL";
    const priority = (formData.get("priority") as string) || "NORMAL";
    const disburseOn = formData.get("disburseOn") as string;
    const paymentMode = formData.get("paymentMode") as string;
    const comments = formData.get("comments") as string;
    const action = formData.get("action") as string;
    const pinOrPassword = (formData.get("pinOrPassword") as string) || "";
    const itemsRaw = formData.get("items") as string;

    const items = JSON.parse(itemsRaw || "[]");
    if (!items.length) {
      return NextResponse.json({ error: "Requisition must contain at least one item" }, { status: 400 });
    }

    // Verify PIN or password
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

    // Load project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { company: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find IT Checker (Abir Abedin)
    const itChecker = await prisma.user.findFirst({
      where: {
        role: { permissions: { has: "req.approve.it" } },
        active: true,
      },
    });

    // Find Category Director
    const categoryDirector = await prisma.user.findFirst({
      where: {
        role: { permissions: { has: "req.director" } },
        directorCategories: { has: category },
        active: true,
      },
    });

    const isManager = user.role.isManager;
    const isMd = user.role.key === "md";

    const chain = resolveChain({
      makerId: user.id,
      makerIsManager: isManager,
      makerPermissions: user.permissions,
      category,
      project: {
        headId: project.headId,
        checkerId: project.checkerId,
        directorId: project.directorId,
        mdApprovalMode: project.mdApprovalMode,
        releaseBeforeMd: project.releaseBeforeMd,
      },
      departmentHeadId: user.departmentId
        ? (await prisma.department.findUnique({ where: { id: user.departmentId } }))?.headId ?? null
        : null,
      itCheckerId: itChecker?.id ?? null,
      categoryDirectorId: categoryDirector?.id ?? null,
      makerIsMd: isMd,
    });

    // Calculations
    const total = grandTotal(items.map((it: any) => ({ qty: it.qty, unitPrice: it.unitPrice })));
    const inWords = amountInWords(total);
    const ip = await clientIp();

    const isDraft = action === "DRAFT";
    const number = isDraft ? null : await generateRequisitionNumber(project.company.code, type);
    const initialWorkflow = isDraft ? { status: "DRAFT", step: null, assigneeId: null, mdStatus: "PENDING" } : stateAfter(chain, 0, project.releaseBeforeMd);

    // Hash for signature integrity
    const docSummary = JSON.stringify({ number, companyId, projectId, total: total.toString(), items });
    const docHash = crypto.createHash("sha256").update(docSummary).digest("hex");

    const requisition = await prisma.requisition.create({
      data: {
        number,
        companyId: project.companyId,
        projectId,
        departmentId: user.departmentId,
        type,
        category,
        priority,
        makerId: user.id,
        makerName: user.name,
        makerDesignation: user.designation,
        disburseOn: disburseOn ? new Date(disburseOn) : null,
        total: total.toNumber(),
        amountInWords: inWords,
        comments,
        paymentMode,
        status: initialWorkflow.status,
        mdStatus: initialWorkflow.mdStatus,
        chain: chain as any,
        stepIndex: 0,
        currentAssigneeId: initialWorkflow.assigneeId,
        submittedAt: isDraft ? null : new Date(),
        items: {
          create: items.map((it: any) => ({
            sl: it.sl,
            particulars: it.particulars,
            purpose: it.purpose,
            qty: it.qty,
            unitPrice: it.unitPrice,
            amount: it.qty * it.unitPrice,
          })),
        },
        approvals: isDraft
          ? undefined
          : {
              create: {
                step: "MAKER",
                action: "SUBMITTED",
                userId: user.id,
                signerName: user.name,
                signerDesignation: user.designation,
                signature: user.signature,
                comment: "Submitted and digitally signed",
                docHash,
                ip,
              },
            },
        auditLogs: {
          create: {
            userId: user.id,
            action: isDraft ? "SAVED_DRAFT" : "SUBMITTED_AND_SIGNED",
            details: `Requisition ${number || "Draft"} for Tk ${total.toString()} submitted.`,
            ip,
          },
        },
      },
    });

    // Handle uploaded attachments if any
    const files = formData.getAll("files") as File[];
    for (const file of files) {
      if (file && file.size > 0) {
        const bytes = Buffer.from(await file.arrayBuffer());
        await prisma.attachment.create({
          data: {
            requisitionId: requisition.id,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            data: bytes,
            uploadedById: user.id,
          },
        });
      }
    }

    return NextResponse.json({ id: requisition.id, number: requisition.number });
  } catch (err: any) {
    console.error("Requisition creation error:", err);
    return NextResponse.json({ error: err.message || "Failed to create requisition" }, { status: 500 });
  }
}
