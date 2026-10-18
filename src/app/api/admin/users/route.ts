import { NextResponse } from "next/server";
import { requirePermission, hashSecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("admin.users");
    const body = await request.json();

    const {
      employeeId,
      name,
      email,
      password,
      designation,
      roleId,
      priorityLevel = 2,
      levelLabel = "Executive",
      companyId,
      departmentId,
      newDepartmentName,
      secondaryDepartments = [],
      supervisorId,
      approvalNotes,
      companyScopeIds = [],
      projectScopeIds = [],
      directorCategories = [],
      extraPermissions = [],
      active = true,
    } = body;

    if (!name || !email || !roleId) {
      return NextResponse.json(
        { error: "Name, Email, and Role are required" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json(
        { error: `A user with email "${cleanEmail}" already exists` },
        { status: 400 }
      );
    }

    let resolvedDeptId = departmentId || null;
    if (newDepartmentName && String(newDepartmentName).trim()) {
      const deptName = String(newDepartmentName).trim();
      const foundDept = await prisma.department.findFirst({
        where: { name: deptName, companyId: null },
      });
      const deptRow =
        foundDept ?? (await prisma.department.create({ data: { name: deptName } }));
      resolvedDeptId = deptRow.id;
    }

    // Default login password to the user's email address if none specified
    const initialSecret = password && String(password).trim() ? String(password).trim() : cleanEmail;
    const passwordHash = await hashSecret(initialSecret);

    const created = await prisma.user.create({
      data: {
        employeeId: employeeId ? String(employeeId).trim() : null,
        name: String(name).trim(),
        email: cleanEmail,
        designation: designation ? String(designation).trim() : levelLabel || "Executive",
        priorityLevel: Number(priorityLevel) || 2,
        levelLabel: levelLabel || "Executive",
        secondaryDepartments: Array.isArray(secondaryDepartments)
          ? secondaryDepartments.filter(Boolean)
          : [],
        approvalNotes: approvalNotes ? String(approvalNotes).trim() : null,
        supervisorId: supervisorId || null,
        passwordHash,
        roleId,
        companyId: companyId || null,
        departmentId: resolvedDeptId,
        directorCategories: Array.isArray(directorCategories) ? directorCategories : [],
        extraPermissions: Array.isArray(extraPermissions) ? extraPermissions : [],
        active: Boolean(active),
        companyScopes: {
          connect: (Array.isArray(companyScopeIds) ? companyScopeIds : []).map((id: string) => ({
            id,
          })),
        },
        projectScopes: {
          connect: (Array.isArray(projectScopeIds) ? projectScopeIds : []).map((id: string) => ({
            id,
          })),
        },
      },
    });

    const ip = await clientIp();
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "USER_CREATED",
        details: `Created user ${created.name} (${created.email}, Priority ${created.priorityLevel}, Level ${created.levelLabel})`,
        ip,
      },
    });

    return NextResponse.json({ success: true, user: created });
  } catch (err: any) {
    console.error("Admin user create error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePermission("admin.users");
    const body = await request.json();

    const {
      id,
      employeeId,
      name,
      email,
      password,
      designation,
      roleId,
      priorityLevel,
      levelLabel,
      companyId,
      departmentId,
      newDepartmentName,
      secondaryDepartments,
      supervisorId,
      approvalNotes,
      companyScopeIds,
      projectScopeIds,
      directorCategories,
      extraPermissions,
      active,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cleanEmail = email ? String(email).toLowerCase().trim() : existing.email;
    if (cleanEmail !== existing.email) {
      const conflict = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { error: `Another user already has email "${cleanEmail}"` },
          { status: 400 }
        );
      }
    }

    let resolvedDeptId = departmentId !== undefined ? departmentId || null : existing.departmentId;
    if (newDepartmentName && String(newDepartmentName).trim()) {
      const deptName = String(newDepartmentName).trim();
      const foundDept = await prisma.department.findFirst({
        where: { name: deptName, companyId: null },
      });
      const deptRow =
        foundDept ?? (await prisma.department.create({ data: { name: deptName } }));
      resolvedDeptId = deptRow.id;
    }

    const updateData: any = {
      employeeId: employeeId !== undefined ? (employeeId ? String(employeeId).trim() : null) : existing.employeeId,
      name: name ? String(name).trim() : existing.name,
      email: cleanEmail,
      designation: designation !== undefined ? String(designation).trim() : existing.designation,
      priorityLevel: priorityLevel !== undefined ? Number(priorityLevel) : existing.priorityLevel,
      levelLabel: levelLabel !== undefined ? levelLabel : existing.levelLabel,
      secondaryDepartments: Array.isArray(secondaryDepartments)
        ? secondaryDepartments.filter(Boolean)
        : existing.secondaryDepartments,
      approvalNotes:
        approvalNotes !== undefined
          ? approvalNotes
            ? String(approvalNotes).trim()
            : null
          : existing.approvalNotes,
      supervisorId: supervisorId !== undefined ? supervisorId || null : existing.supervisorId,
      roleId: roleId || existing.roleId,
      companyId: companyId !== undefined ? companyId || null : existing.companyId,
      departmentId: resolvedDeptId,
      directorCategories: Array.isArray(directorCategories)
        ? directorCategories
        : existing.directorCategories,
      extraPermissions: Array.isArray(extraPermissions)
        ? extraPermissions
        : existing.extraPermissions,
      active: active !== undefined ? Boolean(active) : existing.active,
    };

    if (password && String(password).trim()) {
      updateData.passwordHash = await hashSecret(String(password).trim());
    }

    if (Array.isArray(companyScopeIds)) {
      updateData.companyScopes = {
        set: companyScopeIds.map((cid: string) => ({ id: cid })),
      };
    }

    if (Array.isArray(projectScopeIds)) {
      updateData.projectScopes = {
        set: projectScopeIds.map((pid: string) => ({ id: pid })),
      };
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const ip = await clientIp();
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "USER_UPDATED",
        details: `Updated user ${updated.name} (${updated.email}, Priority ${updated.priorityLevel}, Role ${updated.roleId})`,
        ip,
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    console.error("Admin user update error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requirePermission("admin.users");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (id === admin.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            requisitions: true,
            approvals: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ip = await clientIp();

    if (user._count.requisitions > 0 || user._count.approvals > 0) {
      await prisma.user.update({
        where: { id },
        data: { active: false },
      });
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: "USER_DEACTIVATED",
          details: `Deactivated user ${user.name} (${user.email}) — preserved ${user._count.requisitions} requisitions & ${user._count.approvals} signatures`,
          ip,
        },
      });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: "User has historical requisitions/signatures and was deactivated instead of permanently deleted.",
      });
    }

    // Disconnect relations before deleting
    await prisma.user.update({
      where: { id },
      data: {
        companyScopes: { set: [] },
        projectScopes: { set: [] },
        subordinates: { set: [] },
      },
    });

    await prisma.user.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "USER_DELETED",
        details: `Deleted user ${user.name} (${user.email})`,
        ip,
      },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: any) {
    console.error("Admin user delete error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
