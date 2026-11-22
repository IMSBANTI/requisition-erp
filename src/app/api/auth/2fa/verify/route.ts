import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clearPending2faCookie,
  createSession,
  createTrustedDeviceCookie,
  readPending2faCookie,
} from "@/lib/auth";
import {
  checkRateLimit,
  clearRateLimit,
  recordFailedAttempt,
} from "@/lib/security";
import {
  getRequestSecurityContext,
  getSecurityPolicy,
  logSecurityAudit,
} from "@/lib/securityServer";
import {
  decryptTotpSecret,
  generateBackupCodes,
  hashBackupCodes,
  matchBackupCodeIndex,
  verifyTotpCode,
} from "@/lib/totp";

export async function POST(request: Request) {
  try {
    const pending = await readPending2faCookie();
    if (!pending) {
      return NextResponse.json(
        { error: "Your 2FA verification session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const reqCtx = await getRequestSecurityContext(false);
    const rateKey = `2fa:${pending.sub}:${reqCtx.ip || "local"}`;
    const rate = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      const mins = Math.max(1, Math.ceil(rate.retryAfterSeconds / 60));
      return NextResponse.json(
        {
          error: `Too many invalid 2FA attempts. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const code = String(body?.code || "").trim();
    const useBackupCode = Boolean(body?.useBackupCode);
    const trustBrowser = Boolean(body?.trustBrowser);

    if (!code) {
      return NextResponse.json(
        { error: "Please enter the verification code." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: pending.sub },
    });

    if (!user || !user.active) {
      await clearPending2faCookie();
      return NextResponse.json(
        { error: "Account not found or inactive." },
        { status: 401 }
      );
    }

    const policy = await getSecurityPolicy();

    // ─── STAGE 1: MANDATORY FIRST-TIME ENROLLMENT ───
    if (pending.stage === "ENROLL") {
      if (!pending.setupSecretEnc) {
        return NextResponse.json(
          { error: "Setup session invalid. Please sign in again." },
          { status: 400 }
        );
      }
      const plainSecret = decryptTotpSecret(pending.setupSecretEnc);
      const valid = verifyTotpCode(plainSecret, code);
      if (!valid) {
        recordFailedAttempt(rateKey);
        await logSecurityAudit({
          userId: user.id,
          action: "2FA_FAILED",
          details: `Invalid 6-digit code during mandatory 2FA setup (${reqCtx.deviceSummary})`,
          ip: reqCtx.ip,
        });
        return NextResponse.json(
          { error: "Invalid 6-digit authenticator code. Please check your phone clock and try again." },
          { status: 400 }
        );
      }

      const backupCodes = generateBackupCodes(8);
      const hashedBackupCodes = await hashBackupCodes(backupCodes);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecretEnc: pending.setupSecretEnc,
          twoFactorBackupCodes: hashedBackupCodes,
          twoFactorEnrolledAt: new Date(),
        },
      });

      clearRateLimit(rateKey);
      await clearPending2faCookie();
      await createSession(user.id);
      if (trustBrowser && policy.trustedDeviceDays > 0) {
        await createTrustedDeviceCookie(
          user.id,
          reqCtx.userAgent,
          policy.trustedDeviceDays
        );
      }

      await logSecurityAudit({
        userId: user.id,
        action: "2FA_ENABLED",
        details: `Completed mandatory Authenticator 2FA enrollment (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });

      return NextResponse.json({
        success: true,
        enrolled: true,
        backupCodes,
      });
    }

    // ─── STAGE 2: REGULAR 2FA VERIFICATION ───
    if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) {
      await clearPending2faCookie();
      return NextResponse.json(
        { error: "2FA is not configured on this account. Please sign in again." },
        { status: 400 }
      );
    }

    let verified = false;
    let usedRecovery = false;

    if (useBackupCode) {
      const matchIdx = await matchBackupCodeIndex(code, user.twoFactorBackupCodes || []);
      if (matchIdx >= 0) {
        verified = true;
        usedRecovery = true;
        const remaining = [...(user.twoFactorBackupCodes || [])];
        remaining.splice(matchIdx, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: remaining },
        });
      }
    } else {
      const plainSecret = decryptTotpSecret(user.twoFactorSecretEnc);
      verified = verifyTotpCode(plainSecret, code);
    }

    if (!verified) {
      recordFailedAttempt(rateKey);
      await logSecurityAudit({
        userId: user.id,
        action: "2FA_FAILED",
        details: `Failed ${useBackupCode ? "backup recovery code" : "6-digit authenticator code"} (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json(
        {
          error: useBackupCode
            ? "Invalid or already-used recovery code."
            : "Invalid 6-digit authenticator code. Please try again.",
        },
        { status: 400 }
      );
    }

    clearRateLimit(rateKey);
    await clearPending2faCookie();
    await createSession(user.id);
    if (trustBrowser && policy.trustedDeviceDays > 0) {
      await createTrustedDeviceCookie(
        user.id,
        reqCtx.userAgent,
        policy.trustedDeviceDays
      );
    }

    await logSecurityAudit({
      userId: user.id,
      action: usedRecovery ? "2FA_BACKUP_USED" : "LOGIN_SUCCESS",
      details: usedRecovery
        ? `Signed in with single-use backup recovery code (${reqCtx.deviceSummary})`
        : `Signed in with Authenticator 2FA${trustBrowser && policy.trustedDeviceDays > 0 ? ` (browser trusted ${policy.trustedDeviceDays}d)` : ""} (${reqCtx.deviceSummary})`,
      ip: reqCtx.ip,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Verification failed" },
      { status: 500 }
    );
  }
}
