import "server-only";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicyConfig,
  SecurityUserLike,
  detectMobileFromHeaders,
  isSuperAdminUser,
  normalizeIp,
  shouldRequireDeviceApproval,
  summarizeUserAgent,
} from "./security";

const DEVICE_TOKEN_COOKIE = "ims_device_token";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function hashDeviceToken(rawToken: string): string {
  return crypto.createHash("sha256").update(`ims-device-v1:${rawToken}`).digest("hex");
}

/** Load the singleton SecurityPolicy row (creating defaults safely if table/row doesn't exist yet). */
export async function getSecurityPolicy(): Promise<SecurityPolicyConfig> {
  try {
    const row = await prisma.securityPolicy.findUnique({
      where: { id: "default" },
    });
    if (!row) return { ...DEFAULT_SECURITY_POLICY };
    return {
      ipLockEnabled: row.ipLockEnabled,
      allowedIps: row.allowedIps || [],
      mobileLockEnabled: row.mobileLockEnabled,
      enforce2faSensitive: row.enforce2faSensitive,
      trustedDeviceDays: row.trustedDeviceDays,
      allowSuperAdminBypass: row.allowSuperAdminBypass,
      deviceApprovalEnabled: row.deviceApprovalEnabled,
      approvedDeviceSkips2fa: row.approvedDeviceSkips2fa,
      skip2faOnOfficeIp: row.skip2faOnOfficeIp,
    };
  } catch {
    return { ...DEFAULT_SECURITY_POLICY };
  }
}

export async function getRequestSecurityContext(clientHintMobile = false) {
  const h = await headers();
  const rawIp =
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for") ||
    h.get("x-real-ip") ||
    "";
  const ip = normalizeIp(rawIp);
  const userAgent = h.get("user-agent") || "";
  const secChUaMobile = h.get("sec-ch-ua-mobile");
  const isMobile = detectMobileFromHeaders(userAgent, secChUaMobile, clientHintMobile);
  const deviceSummary = summarizeUserAgent(userAgent);

  return { ip, userAgent, isMobile, deviceSummary };
}

export async function logSecurityAudit({
  userId,
  action,
  details,
  ip,
}: {
  userId?: string | null;
  action: string;
  details: string;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        details,
        ip: ip || null,
      },
    });
  } catch (err) {
    console.error("Failed to write security audit log:", err);
  }
}

export async function getOrCreateDeviceToken(): Promise<string> {
  const c = await cookies();
  const existing = c.get(DEVICE_TOKEN_COOKIE)?.value;
  if (existing && existing.length >= 24) {
    return existing;
  }
  const fresh = crypto.randomBytes(32).toString("base64url");
  c.set(DEVICE_TOKEN_COOKIE, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return fresh;
}

export async function readDeviceToken(): Promise<string | null> {
  const c = await cookies();
  const val = c.get(DEVICE_TOKEN_COOKIE)?.value;
  return val && val.length >= 24 ? val : null;
}

export type DeviceLoginResult =
  | { status: "APPROVED"; deviceId: string; deviceLabel: string }
  | { status: "NOT_REQUIRED"; deviceStatus: string | null }
  | { status: "PENDING"; deviceId: string; deviceLabel: string; isNew: boolean }
  | { status: "REVOKED"; deviceId: string; deviceLabel: string };

/**
 * Evaluate or register the caller's browser/device during login.
 * - Always attaches a persistent HttpOnly `ims_device_token` cookie.
 * - If an Admin-Approved record already exists for this (userId, tokenHash), updates lastSeen and returns APPROVED.
 * - If a REVOKED record exists and deviceApprovalEnabled is ON, blocks login.
 * - If deviceApprovalEnabled is ON and no APPROVED record exists:
 *   - Auto-approves Super Admin when allowSuperAdminBypass is ON (anti-lockout).
 *   - Otherwise registers a PENDING device request so Super Admin can approve in 1 click!
 * - Even when deviceApprovalEnabled is OFF, if an approved record exists we return APPROVED so
 *   pre-approved executive devices (MD/Directors) still get smooth login!
 */
export async function evaluateOrRegisterDeviceForLogin({
  user,
  policy,
  reqCtx,
}: {
  user: SecurityUserLike;
  policy: SecurityPolicyConfig;
  reqCtx: { ip: string; userAgent: string; deviceSummary: string };
}): Promise<DeviceLoginResult> {
  try {
    const rawToken = await getOrCreateDeviceToken();
    const tokenHash = hashDeviceToken(rawToken);
    const now = new Date();

    const existing = await prisma.trustedDevice.findUnique({
      where: {
        userId_tokenHash: { userId: user.id, tokenHash },
      },
    });

    if (existing) {
      await prisma.trustedDevice.update({
        where: { id: existing.id },
        data: {
          lastIp: reqCtx.ip || existing.lastIp,
          lastSeenAt: now,
          userAgent: reqCtx.userAgent || existing.userAgent,
        },
      });

      if (existing.status === "APPROVED") {
        return {
          status: "APPROVED",
          deviceId: existing.id,
          deviceLabel: existing.deviceLabel,
        };
      }

      if (existing.status === "REVOKED") {
        if (shouldRequireDeviceApproval(user, policy)) {
          return {
            status: "REVOKED",
            deviceId: existing.id,
            deviceLabel: existing.deviceLabel,
          };
        }
        return { status: "NOT_REQUIRED", deviceStatus: "REVOKED" };
      }

      // Existing PENDING row
      if (shouldRequireDeviceApproval(user, policy)) {
        return {
          status: "PENDING",
          deviceId: existing.id,
          deviceLabel: existing.deviceLabel,
          isNew: false,
        };
      }

      return { status: "NOT_REQUIRED", deviceStatus: "PENDING" };
    }

    // No existing device row for this user + browser
    const envSuperBypass = process.env.SUPER_ADMIN_BYPASS_IP_LOCK === "true";
    const autoApproveSuper =
      isSuperAdminUser(user) && (policy.allowSuperAdminBypass || envSuperBypass);

    if (autoApproveSuper && policy.deviceApprovalEnabled) {
      const created = await prisma.trustedDevice.create({
        data: {
          userId: user.id,
          tokenHash,
          deviceLabel: `${reqCtx.deviceSummary} (Super Admin)`,
          userAgent: reqCtx.userAgent || null,
          status: "APPROVED",
          firstIp: reqCtx.ip || null,
          lastIp: reqCtx.ip || null,
          lastSeenAt: now,
          approvedAt: now,
        },
      });
      return {
        status: "APPROVED",
        deviceId: created.id,
        deviceLabel: created.deviceLabel,
      };
    }

    if (shouldRequireDeviceApproval(user, policy)) {
      const created = await prisma.trustedDevice.create({
        data: {
          userId: user.id,
          tokenHash,
          deviceLabel: reqCtx.deviceSummary,
          userAgent: reqCtx.userAgent || null,
          status: "PENDING",
          firstIp: reqCtx.ip || null,
          lastIp: reqCtx.ip || null,
          lastSeenAt: now,
        },
      });
      return {
        status: "PENDING",
        deviceId: created.id,
        deviceLabel: created.deviceLabel,
        isNew: true,
      };
    }

    // Policy is OFF right now — register as PENDING quietly so Super Admin can pre-approve
    // MD/Director/office devices before switching Trusted Device Approval ON!
    await prisma.trustedDevice.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceLabel: reqCtx.deviceSummary,
        userAgent: reqCtx.userAgent || null,
        status: "PENDING",
        firstIp: reqCtx.ip || null,
        lastIp: reqCtx.ip || null,
        lastSeenAt: now,
      },
    });

    return { status: "NOT_REQUIRED", deviceStatus: "PENDING" };
  } catch (err) {
    console.error("TrustedDevice check fallback:", err);
    return { status: "NOT_REQUIRED", deviceStatus: null };
  }
}

/**
 * Continuous session guard: if deviceApprovalEnabled is ON and a user's device is revoked
 * or missing its approved token, immediately invalidate page access.
 */
export async function verifyActiveSessionDevice({
  user,
  policy,
}: {
  user: SecurityUserLike;
  policy: SecurityPolicyConfig;
}): Promise<boolean> {
  if (!shouldRequireDeviceApproval(user, policy)) return true;
  try {
    const rawToken = await readDeviceToken();
    if (!rawToken) return false;
    const tokenHash = hashDeviceToken(rawToken);
    const device = await prisma.trustedDevice.findUnique({
      where: {
        userId_tokenHash: { userId: user.id, tokenHash },
      },
      select: { status: true },
    });
    return device?.status === "APPROVED";
  } catch {
    return true;
  }
}
