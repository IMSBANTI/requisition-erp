import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  extractProjectMeta,
  packCostHeadsWithMeta,
  resolveCostHeadsForKind,
} from "@/lib/profitEngine";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const isSuperAdmin =
      user.permissions.includes("project.manage") ||
      user.permissions.includes("admin.users");
    const isGroupHead = Boolean(user.role.isManager);

    if (!isSuperAdmin && !isGroupHead) {
      return NextResponse.json(
        { error: "Only Admin or a Group Head can create a new project" },
        { status: 403 }
      );
    }

    const {
      code,
      name,
      companyId,
      kind,
      category,
      mdApprovalMode,
      headId,
      checkerId,
      directorId,
      memberIds,
      requisitionTypes,
      budget,
      billingProfile,
      feeRate,
      aitRate,
      vatRate,
      billCycleDays,
      funding,
      salaryMonthLag,
      fixedMonthlyBill,
      maintenanceBudget,
      monthlyAmortization,
      varianceThresholdPct,
      costHeads,
      stepThresholds,
    } = await request.json();

    if (!code || !name || !companyId) {
      return NextResponse.json({ error: "Code, name, and company are required" }, { status: 400 });
    }

    const effectiveHeadId = isSuperAdmin ? headId || null : headId || user.id;
    const packedCostHeads = costHeads
      ? packCostHeadsWithMeta(costHeads, {
          stepThresholds: stepThresholds || {},
        })
      : undefined;

    const project = await prisma.project.create({
      data: {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        companyId,
        kind: kind || "PERMANENT",
        category: category || "GENERAL",
        mdApprovalMode: mdApprovalMode || "INSTANT",
        headId: effectiveHeadId,
        checkerId: checkerId || null,
        directorId: directorId || null,
        requisitionTypes: requisitionTypes?.length ? requisitionTypes : ["BPO", "ADMIN", "CASH"],
        budget: budget ? Number(budget) : null,
        billingProfile: billingProfile || "COST_PLUS",
        feeRate: feeRate !== undefined ? Number(feeRate) : 0.08,
        aitRate: aitRate !== undefined ? Number(aitRate) : 0.012,
        vatRate: vatRate !== undefined ? Number(vatRate) : 0.15,
        billCycleDays: billCycleDays !== undefined ? Number(billCycleDays) : 30,
        funding: funding || "POSTPAID",
        salaryMonthLag: salaryMonthLag !== undefined ? Number(salaryMonthLag) : 1,
        fixedMonthlyBill: fixedMonthlyBill ? Number(fixedMonthlyBill) : null,
        maintenanceBudget: maintenanceBudget ? Number(maintenanceBudget) : 0,
        monthlyAmortization: monthlyAmortization ? Number(monthlyAmortization) : 0,
        varianceThresholdPct: varianceThresholdPct !== undefined ? Number(varianceThresholdPct) : 10,
        ...(packedCostHeads ? { costHeads: packedCostHeads } : {}),
        createdById: user.id,
        ...(Array.isArray(memberIds) && memberIds.length > 0
          ? { members: { connect: memberIds.map((id: string) => ({ id })) } }
          : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PROJECT_CREATED",
        details: `Project ${project.name} (${project.code}) created by ${user.name}`,
      },
    });

    return NextResponse.json(project);
  } catch (err: any) {
    console.error("Project creation error:", err);
    return NextResponse.json({ error: err.message || "Failed to create project" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();

    const {
      id,
      code,
      name,
      companyId,
      kind,
      category,
      mdApprovalMode,
      headId,
      checkerId,
      directorId,
      memberIds,
      requisitionTypes,
      budget,
      active,
      billingProfile,
      feeRate,
      aitRate,
      vatRate,
      billCycleDays,
      funding,
      salaryMonthLag,
      fixedMonthlyBill,
      maintenanceBudget,
      monthlyAmortization,
      varianceThresholdPct,
      costHeads,
      stepThresholds,
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const existingProject = await prisma.project.findUnique({ where: { id } });
    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isSuperAdmin =
      user.permissions.includes("project.manage") ||
      user.permissions.includes("admin.users");
    const isProjectGroupHead = existingProject.headId === user.id;

    if (!isSuperAdmin && !isProjectGroupHead) {
      return NextResponse.json(
        {
          error:
            "Unauthorized: Only Admin or this project's assigned Group Head can edit Project Setup.",
        },
        { status: 403 }
      );
    }

    const existingMeta = extractProjectMeta(existingProject.costHeads);
    const isEvt =
      (kind || existingProject.kind) === "EVENT" ||
      (code || existingProject.code)?.toUpperCase().startsWith("EVT-");
    const resolvedHeads =
      costHeads !== undefined
        ? costHeads
        : resolveCostHeadsForKind(existingProject.costHeads, isEvt);

    const updatedMeta = {
      ...existingMeta,
      ...(stepThresholds !== undefined ? { stepThresholds } : {}),
    };
    const packedCostHeads = packCostHeadsWithMeta(resolvedHeads, updatedMeta);

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(code ? { code: code.trim().toUpperCase() } : {}),
        ...(name ? { name: name.trim() } : {}),
        ...(companyId ? { companyId } : {}),
        ...(kind ? { kind } : {}),
        ...(category ? { category } : {}),
        ...(mdApprovalMode ? { mdApprovalMode } : {}),
        ...(headId !== undefined ? { headId: headId || null } : {}),
        ...(checkerId !== undefined ? { checkerId: checkerId || null } : {}),
        ...(directorId !== undefined ? { directorId: directorId || null } : {}),
        ...(Array.isArray(memberIds)
          ? { members: { set: memberIds.map((uid: string) => ({ id: uid })) } }
          : {}),
        ...(requisitionTypes ? { requisitionTypes } : {}),
        ...(budget !== undefined ? { budget: budget ? Number(budget) : null } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
        ...(billingProfile ? { billingProfile } : {}),
        ...(feeRate !== undefined ? { feeRate: Number(feeRate) } : {}),
        ...(aitRate !== undefined ? { aitRate: Number(aitRate) } : {}),
        ...(vatRate !== undefined ? { vatRate: Number(vatRate) } : {}),
        ...(billCycleDays !== undefined ? { billCycleDays: Number(billCycleDays) } : {}),
        ...(funding ? { funding } : {}),
        ...(salaryMonthLag !== undefined ? { salaryMonthLag: Number(salaryMonthLag) } : {}),
        ...(fixedMonthlyBill !== undefined
          ? { fixedMonthlyBill: fixedMonthlyBill ? Number(fixedMonthlyBill) : null }
          : {}),
        ...(maintenanceBudget !== undefined
          ? { maintenanceBudget: maintenanceBudget ? Number(maintenanceBudget) : 0 }
          : {}),
        ...(monthlyAmortization !== undefined
          ? { monthlyAmortization: monthlyAmortization ? Number(monthlyAmortization) : 0 }
          : {}),
        ...(varianceThresholdPct !== undefined
          ? { varianceThresholdPct: Number(varianceThresholdPct) }
          : {}),
        costHeads: packedCostHeads,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PROJECT_UPDATED",
        details: `Project ${updated.name} (${updated.code}) updated by ${user.name}`,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Project update error:", err);
    return NextResponse.json({ error: err.message || "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();

    if (!user.permissions.includes("project.manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    // Check if the project exists
    const targetProject = await prisma.project.findUnique({ where: { id } });
    if (!targetProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if any requisitions exist for this project
    const reqCount = await prisma.requisition.count({ where: { projectId: id } });

    if (reqCount > 0) {
      // Find a fallback project (same company first, otherwise any other project) so we can permanently delete this project
      const fallbackProject =
        (await prisma.project.findFirst({
          where: { id: { not: id }, companyId: targetProject.companyId, active: true },
          orderBy: { createdAt: "asc" },
        })) ||
        (await prisma.project.findFirst({
          where: { id: { not: id } },
          orderBy: { createdAt: "asc" },
        }));

      if (fallbackProject) {
        await prisma.requisition.updateMany({
          where: { projectId: id },
          data: { projectId: fallbackProject.id },
        });
      } else {
        // Only if it is the very last project in the entire database and has requisitions, delete those requisitions' items/approvals/attachments first
        const reqIds = (
          await prisma.requisition.findMany({ where: { projectId: id }, select: { id: true } })
        ).map((r) => r.id);
        await prisma.requisitionItem.deleteMany({ where: { requisitionId: { in: reqIds } } });
        await prisma.approval.deleteMany({ where: { requisitionId: { in: reqIds } } });
        await prisma.attachment.deleteMany({ where: { requisitionId: { in: reqIds } } });
        await prisma.requisition.deleteMany({ where: { projectId: id } });
      }
    }

    // Disconnect all member relations before deleting
    await prisma.project.update({
      where: { id },
      data: { members: { set: [] } },
    });

    // Permanently delete project
    const deleted = await prisma.project.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PROJECT_DELETED",
        details: `Project ${deleted.name} (${deleted.code}) deleted permanently by ${user.name}`,
      },
    });

    return NextResponse.json({
      deleted: true,
      message: `Project "${deleted.name} (${deleted.code})" was permanently deleted.`,
    });
  } catch (err: any) {
    console.error("Project deletion error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete project" }, { status: 500 });
  }
}
