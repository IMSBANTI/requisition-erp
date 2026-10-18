import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!user.permissions.includes("project.manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    } = await request.json();

    if (!code || !name || !companyId) {
      return NextResponse.json({ error: "Code, name, and company are required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        companyId,
        kind: kind || "PERMANENT",
        category: category || "GENERAL",
        mdApprovalMode: mdApprovalMode || "INSTANT",
        headId: headId || null,
        checkerId: checkerId || null,
        directorId: directorId || null,
        requisitionTypes: requisitionTypes?.length ? requisitionTypes : ["BPO", "ADMIN", "CASH"],
        budget: budget ? Number(budget) : null,
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

    if (!user.permissions.includes("project.manage")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

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

    // Check if any requisitions exist for this project
    const reqCount = await prisma.requisition.count({ where: { projectId: id } });

    if (reqCount > 0) {
      // Archive/deactivate project so existing requisitions remain intact
      const archived = await prisma.project.update({
        where: { id },
        data: { active: false },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "PROJECT_ARCHIVED",
          details: `Project ${archived.name} (${archived.code}) archived (has ${reqCount} historical requisitions) by ${user.name}`,
        },
      });

      return NextResponse.json({
        archived: true,
        message: `Project has ${reqCount} historical requisitions. It has been deactivated/archived so historical records remain intact.`,
      });
    }

    // Permanently delete project if no requisitions exist
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
      message: `Project ${deleted.name} (${deleted.code}) was deleted successfully.`,
    });
  } catch (err: any) {
    console.error("Project deletion error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete project" }, { status: 500 });
  }
}
