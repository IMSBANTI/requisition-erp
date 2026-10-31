import { NextResponse } from "next/server";
import { requireUser, hashSecret, verifySecret, clientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireUser();
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required." },
        { status: 400 }
      );
    }

    const cleanCurrent = String(currentPassword).trim();
    const cleanNew = String(newPassword).trim();

    if (cleanNew.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Verify current password
    const matchesHash = await verifySecret(cleanCurrent, dbUser.passwordHash);
    const cleanCurrentLower = cleanCurrent.toLowerCase();
    const matchesDefaultFallback =
      dbUser.mustChangePassword &&
      (cleanCurrentLower === dbUser.email.toLowerCase() ||
        cleanCurrent === "Ims@12345" ||
        (dbUser.email.includes("officestuff@ims.net.bd") &&
          cleanCurrentLower === "officestuff@ims.net.bd"));

    if (!matchesHash && !matchesDefaultFallback) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const passwordHash = await hashSecret(cleanNew);
    const ip = await clientIp();

    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: dbUser.id,
        action: "USER_CHANGED_PASSWORD",
        details: `${dbUser.name} updated their account login password.`,
        ip,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update password." },
      { status: 500 }
    );
  }
}
