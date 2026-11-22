import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import {
  createPending2faCookie,
  createSession,
  hasValidTrustedDevice,
  verifySecret,
} from "@/lib/auth";
import {
  checkRateLimit,
  clearRateLimit,
  evaluateAccessPolicy,
  is2FARequiredForUser,
  recordFailedAttempt,
} from "@/lib/security";
import {
  getRequestSecurityContext,
  getSecurityPolicy,
  logSecurityAudit,
} from "@/lib/securityServer";
import {
  buildOtpAuthUri,
  encryptTotpSecret,
  generateTotpSecret,
} from "@/lib/totp";

const LEGACY_TO_OFFICIAL_EMAIL: Record<string, string> = {
  "moushumi@ims.combd": "moushumi@ims.com.bd",
  "abir@ims.com.bd": "admin@ims.com.bd",
  "iftekhar@ims.com.bd": "nahiyan@ims.com.bd",
  "md@ims.com.bd": "sami.hasan@ims.com.bd",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, clientHintMobile = false } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const reqCtx = await getRequestSecurityContext(Boolean(clientHintMobile));
    const rawIdentifier = String(email).toLowerCase().trim();
    const rateKey = `login:${rawIdentifier}:${reqCtx.ip || "local"}`;
    const rate = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      const mins = Math.max(1, Math.ceil(rate.retryAfterSeconds / 60));
      return NextResponse.json(
        {
          error: `Too many failed sign-in attempts. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
        },
        { status: 429 }
      );
    }

    const normalizedEmail = LEGACY_TO_OFFICIAL_EMAIL[rawIdentifier] || rawIdentifier;

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user && normalizedEmail !== rawIdentifier) {
      user = await prisma.user.findUnique({
        where: { email: rawIdentifier },
        include: { role: true },
      });
    }

    // Also allow login by Employee ID (e.g. "1001", "1027")
    if (!user) {
      user = await prisma.user.findFirst({
        where: { employeeId: rawIdentifier },
        include: { role: true },
      });
    }

    if (!user || !user.active) {
      recordFailedAttempt(rateKey);
      return NextResponse.json(
        { error: "Invalid email/ID or account is inactive" },
        { status: 401 }
      );
    }

    const cleanPass = String(password).trim();
    const cleanPassLower = cleanPass.toLowerCase();

    const matchesHash = await verifySecret(cleanPass, user.passwordHash);
    const matchesEmail =
      user.mustChangePassword &&
      (cleanPassLower === user.email.toLowerCase() ||
        cleanPassLower === rawIdentifier ||
        (user.email.includes("officestuff@ims.net.bd") &&
          cleanPassLower === "officestuff@ims.net.bd"));
    const matchesDefault = user.mustChangePassword && cleanPass === "Ims@12345";

    if (!matchesHash && !matchesEmail && !matchesDefault) {
      recordFailedAttempt(rateKey);
      await logSecurityAudit({
        userId: user.id,
        action: "LOGIN_FAILED",
        details: `Invalid password attempt (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Credentials valid — clear login brute-force counter
    clearRateLimit(rateKey);

    const policy = await getSecurityPolicy();
    const permissions = Array.from(
      new Set([...(user.role?.permissions || []), ...(user.extraPermissions || [])])
    );
    const securityUser = {
      id: user.id,
      priorityLevel: user.priorityLevel,
      levelLabel: user.levelLabel,
      role: user.role,
      permissions,
      extraPermissions: user.extraPermissions || [],
      twoFactorEnabled: user.twoFactorEnabled,
    };

    // Enforce IP Lock & Mobile Access Lock
    const access = evaluateAccessPolicy({
      user: securityUser,
      policy,
      ip: reqCtx.ip,
      isMobile: reqCtx.isMobile,
    });

    if (!access.allowed) {
      await logSecurityAudit({
        userId: user.id,
        action:
          access.code === "MOBILE_BLOCKED"
            ? "LOGIN_BLOCKED_MOBILE"
            : "LOGIN_BLOCKED_IP",
        details: `${access.reason} (${reqCtx.deviceSummary})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json(
        { error: access.reason, blockedCode: access.code },
        { status: 403 }
      );
    }

    // Check Two-Factor Authentication (TOTP)
    const twoFaRequired = is2FARequiredForUser(securityUser, policy);

    if (user.twoFactorEnabled && user.twoFactorSecretEnc) {
      const trusted = await hasValidTrustedDevice(
        user.id,
        reqCtx.userAgent,
        policy.trustedDeviceDays
      );
      if (trusted) {
        await createSession(user.id);
        await logSecurityAudit({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          details: `Signed in via trusted browser (${reqCtx.deviceSummary})`,
          ip: reqCtx.ip,
        });
        return NextResponse.json({ success: true });
      }

      await createPending2faCookie({ sub: user.id, stage: "VERIFY" });
      return NextResponse.json({
        require2fa: true,
        mode: "VERIFY",
        accountName: user.email,
        userName: user.name,
        trustedDeviceDays: policy.trustedDeviceDays,
      });
    }

    if (twoFaRequired) {
      const secret = generateTotpSecret();
      const setupSecretEnc = encryptTotpSecret(secret);
      const otpauthUrl = buildOtpAuthUri({
        issuer: "IMS GROUP ERP",
        accountName: user.email,
        secret,
      });
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
      });

      await createPending2faCookie({
        sub: user.id,
        stage: "ENROLL",
        setupSecretEnc,
      });

      return NextResponse.json({
        require2fa: true,
        mode: "ENROLL",
        accountName: user.email,
        userName: user.name,
        qrDataUrl,
        manualKey: secret,
        trustedDeviceDays: policy.trustedDeviceDays,
      });
    }

    await createSession(user.id);
    await logSecurityAudit({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      details: `Signed in (${reqCtx.deviceSummary})`,
      ip: reqCtx.ip,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
