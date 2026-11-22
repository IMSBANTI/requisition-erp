import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";
import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicyConfig,
  detectMobileFromHeaders,
  normalizeIp,
  summarizeUserAgent,
} from "./security";

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
