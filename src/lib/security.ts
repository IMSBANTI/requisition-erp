/**
 * Pure Security Policy, IP/CIDR Matching, Mobile Detection & Rate-Limiting Helpers.
 * Zero DB imports so this module can be unit-tested cleanly and imported anywhere.
 */

export const SECURITY_PERMISSIONS = {
  ALLOW_REMOTE_IP: "security.allow.remote_ip",
  ALLOW_MOBILE: "security.allow.mobile",
  REQUIRE_2FA: "security.require.2fa",
  EXEMPT_2FA: "security.exempt.2fa",
  BYPASS_DEVICE_APPROVAL: "security.bypass.device_approval",
} as const;

export const SECURITY_PERMISSION_LIST = [
  SECURITY_PERMISSIONS.ALLOW_REMOTE_IP,
  SECURITY_PERMISSIONS.ALLOW_MOBILE,
  SECURITY_PERMISSIONS.REQUIRE_2FA,
  SECURITY_PERMISSIONS.EXEMPT_2FA,
  SECURITY_PERMISSIONS.BYPASS_DEVICE_APPROVAL,
] as const;

export interface SecurityPolicyConfig {
  ipLockEnabled: boolean;
  allowedIps: string[];
  mobileLockEnabled: boolean;
  enforce2faSensitive: boolean;
  trustedDeviceDays: number;
  allowSuperAdminBypass: boolean;
  deviceApprovalEnabled: boolean;
  approvedDeviceSkips2fa: boolean;
  skip2faOnOfficeIp: boolean;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  ipLockEnabled: false,
  allowedIps: [],
  mobileLockEnabled: false,
  enforce2faSensitive: true,
  trustedDeviceDays: 14,
  allowSuperAdminBypass: true,
  deviceApprovalEnabled: false,
  approvedDeviceSkips2fa: true,
  skip2faOnOfficeIp: true,
};

export interface SecurityUserLike {
  id: string;
  priorityLevel?: number | null;
  levelLabel?: string | null;
  role?: { key: string; permissions?: string[]; isManager?: boolean } | null;
  roleKey?: string | null;
  permissions?: string[];
  extraPermissions?: string[];
  twoFactorEnabled?: boolean;
}

function getAllUserPerms(user: SecurityUserLike): string[] {
  return Array.from(
    new Set([
      ...(user.permissions || []),
      ...(user.role?.permissions || []),
      ...(user.extraPermissions || []),
    ])
  );
}

export function isSuperAdminUser(user: SecurityUserLike): boolean {
  const roleKey = user.role?.key || user.roleKey || "";
  const perms = getAllUserPerms(user);
  return (
    (user.priorityLevel ?? 2) >= 5 ||
    roleKey === "super_admin" ||
    perms.includes("admin.users")
  );
}

export function isExecutiveOrDirectorUser(user: SecurityUserLike): boolean {
  const roleKey = user.role?.key || user.roleKey || "";
  const perms = getAllUserPerms(user);
  return (
    isSuperAdminUser(user) ||
    roleKey === "md" ||
    roleKey === "director" ||
    user.levelLabel === "MD" ||
    user.levelLabel === "Director" ||
    perms.includes("req.md") ||
    perms.includes("req.director")
  );
}

export function isAccountsUser(user: SecurityUserLike): boolean {
  const roleKey = user.role?.key || user.roleKey || "";
  const perms = getAllUserPerms(user);
  return (
    roleKey.startsWith("accounts") ||
    perms.includes("req.accounts.check") ||
    perms.includes("req.execute") ||
    perms.includes("req.forward")
  );
}

export function hasFinancialReportAccess(user: SecurityUserLike): boolean {
  const roleKey = user.role?.key || user.roleKey || "";
  const perms = getAllUserPerms(user);
  if (isSuperAdminUser(user)) return true;
  if (perms.includes("report.none")) return false;
  return (
    perms.includes("report.view") ||
    perms.includes("report.view.all") ||
    perms.includes("admin.readonly") ||
    perms.includes("req.director") ||
    perms.includes("req.md") ||
    perms.includes("req.accounts.check") ||
    perms.includes("req.execute") ||
    Boolean(user.role?.isManager) ||
    roleKey.includes("manager")
  );
}

/** MD, Directors, Accounts, Super Admin, and any user with Financial Reports / P&L access. */
export function isSensitiveRoleFor2FA(user: SecurityUserLike): boolean {
  return (
    isExecutiveOrDirectorUser(user) ||
    isAccountsUser(user) ||
    hasFinancialReportAccess(user)
  );
}

/** Whether 2FA enrollment/verification is mandatory for this user under the active policy. */
export function is2FARequiredForUser(
  user: SecurityUserLike,
  policy: SecurityPolicyConfig
): boolean {
  const extra = user.extraPermissions || [];
  if (extra.includes(SECURITY_PERMISSIONS.EXEMPT_2FA)) return false;
  if (extra.includes(SECURITY_PERMISSIONS.REQUIRE_2FA)) return true;
  if (policy.enforce2faSensitive && isSensitiveRoleFor2FA(user)) return true;
  return false;
}

/** Whether a user must sign in from an Admin-Approved Device under the active policy. */
export function shouldRequireDeviceApproval(
  user: SecurityUserLike,
  policy: SecurityPolicyConfig
): boolean {
  if (!policy.deviceApprovalEnabled) return false;
  const extra = user.extraPermissions || [];
  if (extra.includes(SECURITY_PERMISSIONS.BYPASS_DEVICE_APPROVAL)) return false;
  const envSuperBypass = process.env.SUPER_ADMIN_BYPASS_IP_LOCK === "true";
  if (isSuperAdminUser(user) && (policy.allowSuperAdminBypass || envSuperBypass)) {
    return false;
  }
  return true;
}

/** Whether an Admin-Approved Device allows smooth password-only login (skipping Authenticator 2FA). */
export function shouldSkip2faOnApprovedDevice(
  policy: SecurityPolicyConfig,
  deviceStatus: string | null | undefined
): boolean {
  return Boolean(policy.approvedDeviceSkips2fa && deviceStatus === "APPROVED");
}

/** Whether signing in from an Authorized Office IP skips 2FA (so switching Chrome/Edge on an office laptop is smooth). */
export function shouldSkip2faOnOfficeIp(
  policy: SecurityPolicyConfig,
  ip: string | null | undefined
): boolean {
  if (!policy.skip2faOnOfficeIp) return false;
  if (!policy.allowedIps || policy.allowedIps.length === 0) return false;
  return isIpAllowed(ip, policy.allowedIps, { allowLocalhostInDev: false });
}

/** Normalize raw client IP (strips ::ffff: IPv4-mapped IPv6 prefix and ports). */
export function normalizeIp(raw: string | null | undefined): string {
  if (!raw) return "";
  let ip = raw.split(",")[0].trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  // Strip IPv4 port if present (e.g., "103.10.20.30:54321")
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }
  return ip.trim();
}

export function isLocalhostIp(ip: string): boolean {
  const clean = normalizeIp(ip);
  return clean === "127.0.0.1" || clean === "::1" || clean === "localhost";
}

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/** Validate an exact IPv4, IPv4/CIDR, or IPv6 entry for Admin Security Settings. */
export function isValidIpOrCidrEntry(entry: string): boolean {
  const clean = entry.trim();
  if (!clean) return false;

  if (clean.includes("/")) {
    const [ipPart, prefixPart, extra] = clean.split("/");
    if (extra !== undefined) return false;
    if (parseIpv4ToInt(ipPart) === null) return false;
    if (!/^\d+$/.test(prefixPart)) return false;
    const prefix = Number(prefixPart);
    return prefix >= 0 && prefix <= 32;
  }

  if (parseIpv4ToInt(clean) !== null) return true;

  // Basic IPv6 literal check
  if (clean.includes(":") && /^[0-9a-fA-F:]+$/.test(clean)) return true;
  return false;
}

/** Match a single IP against an exact IP or IPv4 CIDR entry. */
export function ipMatchesEntry(clientIp: string, entry: string): boolean {
  const cleanIp = normalizeIp(clientIp);
  const cleanEntry = entry.trim();
  if (!cleanIp || !cleanEntry) return false;

  if (cleanEntry.includes("/")) {
    const [networkIp, prefixStr] = cleanEntry.split("/");
    const ipInt = parseIpv4ToInt(cleanIp);
    const netInt = parseIpv4ToInt(networkIp);
    const prefix = Number(prefixStr);
    if (ipInt === null || netInt === null || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    if (prefix === 0) return true;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (netInt & mask);
  }

  return cleanIp.toLowerCase() === normalizeIp(cleanEntry).toLowerCase();
}

export function isIpAllowed(
  clientIp: string | null | undefined,
  allowedIps: string[],
  options?: { allowLocalhostInDev?: boolean }
): boolean {
  const cleanIp = normalizeIp(clientIp);
  const allowLocal =
    options?.allowLocalhostInDev ?? process.env.NODE_ENV !== "production";
  if (allowLocal && isLocalhostIp(cleanIp)) return true;
  if (!cleanIp) return false;

  // Optional emergency env-var allowlist (comma-separated)
  const envAllow = (process.env.SECURITY_ALLOW_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const combined = [...allowedIps, ...envAllow].filter(Boolean);
  if (combined.length === 0) return false;

  return combined.some((entry) => ipMatchesEntry(cleanIp, entry));
}

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle|Windows Phone/i;

export function detectMobileFromHeaders(
  userAgent: string | null | undefined,
  secChUaMobile: string | null | undefined,
  clientHintMobile = false
): boolean {
  if (clientHintMobile) return true;
  if (secChUaMobile && secChUaMobile.trim() === "?1") return true;
  if (userAgent && MOBILE_UA_REGEX.test(userAgent)) return true;
  return false;
}

export function summarizeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent || "";
  if (!ua) return "Unknown Device";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; code: "IP_BLOCKED" | "MOBILE_BLOCKED"; reason: string };

/**
 * Evaluate IP Lock and Mobile Lock for a specific user.
 * - Super Admin bypasses when policy.allowSuperAdminBypass is true (or env SUPER_ADMIN_BYPASS_IP_LOCK !== "false").
 * - MD & Directors bypass IP & Mobile locks by default so they can approve urgent requisitions anywhere.
 * - Any other user can be exempted individually via extraPermissions ("security.allow.remote_ip" / "security.allow.mobile").
 */
export function evaluateAccessPolicy({
  user,
  policy,
  ip,
  isMobile,
  allowLocalhostInDev,
}: {
  user: SecurityUserLike;
  policy: SecurityPolicyConfig;
  ip: string | null | undefined;
  isMobile: boolean;
  allowLocalhostInDev?: boolean;
}): AccessDecision {
  const extra = user.extraPermissions || [];
  const isSuper = isSuperAdminUser(user);
  const isExecOrDir = isExecutiveOrDirectorUser(user);

  const envSuperBypass = process.env.SUPER_ADMIN_BYPASS_IP_LOCK === "true";
  const superBypass = isSuper && (policy.allowSuperAdminBypass || envSuperBypass);

  if (policy.mobileLockEnabled && isMobile) {
    const mobileAllowed =
      superBypass ||
      isExecOrDir ||
      extra.includes(SECURITY_PERMISSIONS.ALLOW_MOBILE);

    if (!mobileAllowed) {
      return {
        allowed: false,
        code: "MOBILE_BLOCKED",
        reason:
          "Mobile & tablet access is restricted by IMS security policy. Please sign in from an office desktop computer or request Mobile Access from Super Admin.",
      };
    }
  }

  if (policy.ipLockEnabled) {
    const remoteIpAllowed =
      superBypass ||
      isExecOrDir ||
      extra.includes(SECURITY_PERMISSIONS.ALLOW_REMOTE_IP);

    if (!remoteIpAllowed && !isIpAllowed(ip, policy.allowedIps, { allowLocalhostInDev })) {
      const displayIp = normalizeIp(ip) || "unknown";
      return {
        allowed: false,
        code: "IP_BLOCKED",
        reason: `Access denied from network IP (${displayIp}). Please connect to the authorized IMS office network or request Remote IP Access from Super Admin.`,
      };
    }
  }

  return { allowed: true };
}

// ───────────────────────── Sliding-Window Rate Limiter ─────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_BUCKETS = new Map<string, RateBucket>();

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  nowMs = Date.now()
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const existing = RATE_LIMIT_BUCKETS.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }
  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.count),
    retryAfterSeconds: 0,
  };
}

export function recordFailedAttempt(
  key: string,
  windowMs = 15 * 60 * 1000,
  nowMs = Date.now()
): number {
  const existing = RATE_LIMIT_BUCKETS.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: nowMs + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export function clearRateLimit(key: string): void {
  RATE_LIMIT_BUCKETS.delete(key);
}
