import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getRequestSecurityContext, logSecurityAudit } from "@/lib/securityServer";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requirePermission("admin.users");
    const reqCtx = await getRequestSecurityContext(false);
    const { id } = await context.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: target.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorBackupCodes: [],
        twoFactorEnrolledAt: null,
      },
    });

    await logSecurityAudit({
      userId: admin.id,
      action: "ADMIN_2FA_RESET",
      details: `Super Admin reset 2FA for ${target.name} (${target.email})`,
      ip: reqCtx.ip,
    });

    return NextResponse.json({
      success: true,
      message: `2FA reset for ${target.name}. They will be prompted to scan a new QR code on next login.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to reset 2FA" },
      { status: 500 }
    );
  }
}
