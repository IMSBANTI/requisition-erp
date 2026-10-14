import { NextResponse } from "next/server";
import { requireUser, hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireUser();

    if (!admin.permissions.includes("admin.users")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const { password } = await request.json();

    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const passwordHash = await hashSecret(password);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: "ADMIN_RESET_PASSWORD",
        details: `Password reset by ${admin.name} for user ${id}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to reset password" }, { status: 500 });
  }
}
