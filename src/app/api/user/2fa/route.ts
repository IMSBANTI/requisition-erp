import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import {
  clearTrustedDeviceCookie,
  requireUser,
  verifySecret,
} from "@/lib/auth";
import { is2FARequiredForUser } from "@/lib/security";
import {
  getRequestSecurityContext,
  getSecurityPolicy,
  logSecurityAudit,
} from "@/lib/securityServer";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotpCode,
} from "@/lib/totp";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const reqCtx = await getRequestSecurityContext(false);
    const body = await request.json();
    const action = String(body?.action || "");

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "START_SETUP") {
      const secret = generateTotpSecret();
      const setupToken = encryptTotpSecret(secret);
      const otpauthUrl = buildOtpAuthUri({
        issuer: "IMS GROUP ERP",
        accountName: dbUser.email,
        secret,
      });
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
      });
      return NextResponse.json({
        qrDataUrl,
        manualKey: secret,
        setupToken,
      });
    }

    if (action === "CONFIRM_SETUP") {
      const code = String(body?.code || "").trim();
      const setupToken = String(body?.setupToken || "").trim();
      if (!code || !setupToken) {
        return NextResponse.json(
          { error: "Setup token and 6-digit code are required." },
          { status: 400 }
        );
      }

      const plainSecret = decryptTotpSecret(setupToken);
      if (!verifyTotpCode(plainSecret, code)) {
        return NextResponse.json(
          { error: "Invalid 6-digit authenticator code. Please try again." },
          { status: 400 }
        );
      }

      const backupCodes = generateBackupCodes(8);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecretEnc: setupToken,
          twoFactorBackupCodes: hashedBackupCodes,
          twoFactorEnrolledAt: new Date(),
        },
      });

      await logSecurityAudit({
        userId: dbUser.id,
        action: "2FA_ENABLED",
        details: `Enabled Authenticator 2FA from profile (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });

      return NextResponse.json({ success: true, backupCodes });
    }

    if (action === "REGENERATE_BACKUP_CODES") {
      const password = String(body?.password || "").trim();
      const code = String(body?.code || "").trim();
      if (!dbUser.twoFactorEnabled || !dbUser.twoFactorSecretEnc) {
        return NextResponse.json(
          { error: "2FA is not currently enabled." },
          { status: 400 }
        );
      }
      const validPass = await verifySecret(password, dbUser.passwordHash);
      if (!validPass) {
        return NextResponse.json(
          { error: "Current login password is incorrect." },
          { status: 400 }
        );
      }
      const plainSecret = decryptTotpSecret(dbUser.twoFactorSecretEnc);
      if (!verifyTotpCode(plainSecret, code)) {
        return NextResponse.json(
          { error: "Invalid 6-digit authenticator code." },
          { status: 400 }
        );
      }

      const backupCodes = generateBackupCodes(8);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { twoFactorBackupCodes: hashedBackupCodes },
      });

      await logSecurityAudit({
        userId: dbUser.id,
        action: "2FA_BACKUP_REGENERATED",
        details: `Regenerated 8 backup recovery codes (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });

      return NextResponse.json({ success: true, backupCodes });
    }

    if (action === "DISABLE") {
      const policy = await getSecurityPolicy();
      if (is2FARequiredForUser(user, policy)) {
        return NextResponse.json(
          {
            error:
              "2FA is mandatory for your role (Super Admin / MD / Director / Accounts / Financial Report access) and cannot be disabled. Contact Super Admin if you lost your authenticator device.",
          },
          { status: 403 }
        );
      }

      const password = String(body?.password || "").trim();
      const code = String(body?.code || "").trim();
      const validPass = await verifySecret(password, dbUser.passwordHash);
      if (!validPass) {
        return NextResponse.json(
          { error: "Current login password is incorrect." },
          { status: 400 }
        );
      }
      if (dbUser.twoFactorSecretEnc) {
        const plainSecret = decryptTotpSecret(dbUser.twoFactorSecretEnc);
        if (!verifyTotpCode(plainSecret, code)) {
          return NextResponse.json(
            { error: "Invalid 6-digit authenticator code." },
            { status: 400 }
          );
        }
      }

      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecretEnc: null,
          twoFactorBackupCodes: [],
          twoFactorEnrolledAt: null,
        },
      });
      await clearTrustedDeviceCookie();

      await logSecurityAudit({
        userId: dbUser.id,
        action: "2FA_DISABLED",
        details: `Disabled optional 2FA from profile (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update 2FA settings" },
      { status: 500 }
    );
  }
}
