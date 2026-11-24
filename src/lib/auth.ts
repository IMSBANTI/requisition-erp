import "server-only";
import crypto from "crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { syncDesignationWithLevel } from "./userDisplay";
import { evaluateAccessPolicy, normalizeIp } from "./security";
import {
  getRequestSecurityContext,
  getSecurityPolicy,
  verifyActiveSessionDevice,
} from "./securityServer";

const COOKIE = "ims_session";
const PENDING_2FA_COOKIE = "ims_2fa_pending";
const TRUSTED_DEVICE_COOKIE = "ims_trusted_device";
const MAX_AGE = 60 * 60 * 12; // 12 hours
const PENDING_2FA_MAX_AGE = 60 * 10; // 10 minutes

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing or too short");
  return new TextEncoder().encode(s);
}

export async function hashSecret(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifySecret(plain: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE);
  c.delete(PENDING_2FA_COOKIE);
}

export interface Pending2faPayload {
  sub: string;
  stage: "VERIFY" | "ENROLL";
  setupSecretEnc?: string;
}

export async function createPending2faCookie(payload: Pending2faPayload) {
  const token = await new SignJWT({
    sub: payload.sub,
    stage: payload.stage,
    setupSecretEnc: payload.setupSecretEnc || null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_2FA_MAX_AGE,
  });
}

export async function readPending2faCookie(): Promise<Pending2faPayload | null> {
  const token = (await cookies()).get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.sub !== "string" ||
      (payload.stage !== "VERIFY" && payload.stage !== "ENROLL")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      stage: payload.stage,
      setupSecretEnc:
        typeof payload.setupSecretEnc === "string" ? payload.setupSecretEnc : undefined,
    };
  } catch {
    return null;
  }
}

export async function clearPending2faCookie() {
  (await cookies()).delete(PENDING_2FA_COOKIE);
}

function deviceUaFingerprint(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent || "unknown").digest("hex").slice(0, 24);
}

export async function createTrustedDeviceCookie(
  userId: string,
  userAgent: string,
  days: number
) {
  if (days <= 0) return;
  const maxAge = days * 24 * 60 * 60;
  const token = await new SignJWT({
    sub: userId,
    fp: deviceUaFingerprint(userAgent),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());

  (await cookies()).set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function hasValidTrustedDevice(
  userId: string,
  userAgent: string,
  trustedDeviceDays: number
): Promise<boolean> {
  if (trustedDeviceDays <= 0) return false;
  const token = (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (
      payload.sub === userId &&
      payload.fp === deviceUaFingerprint(userAgent)
    );
  } catch {
    return false;
  }
}

export async function clearTrustedDeviceCookie() {
  (await cookies()).delete(TRUSTED_DEVICE_COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: true,
      company: true,
      department: true,
      companyScopes: { select: { id: true } },
      projectScopes: { select: { id: true } },
    },
  });
  if (!user || !user.active) return null;
  if (user.designation === "Sr. Manager, IT & Transformation" || user.designation === "Sr. Manager IT & Transformation") {
    user.designation = "Sr. Manager, Information & Transformation";
  }
  if (user.role?.name === "Sr. Manager IT & Transformation (Super Admin)") {
    user.role.name = "Sr. Manager, Information & Transformation (Super Admin)";
  }
  if (user.levelLabel) {
    user.designation = syncDesignationWithLevel(user.designation, user.levelLabel);
  }

  const pLevel = user.priorityLevel ?? 2;
  const extra = user.extraPermissions || [];

  // Base role permissions: strip project.manage / project.view for < P5 unless explicitly granted in Extra User Privileges
  const rolePerms = (user.role?.permissions || []).filter((perm) => {
    if (pLevel < 5 && (perm === "project.manage" || perm === "project.view")) {
      return false;
    }
    return true;
  });

  const permissionsSet = new Set<string>([...rolePerms, ...extra]);

  // Super Admin (P5 or admin.users) automatically gets full view & edit access to Projects, Workflows & Financial Reports
  if (pLevel >= 5 || permissionsSet.has("admin.users")) {
    permissionsSet.add("project.view");
    permissionsSet.add("project.manage");
    permissionsSet.add("report.view");
    permissionsSet.add("report.view.all");
  } else {
    if (extra.includes("project.manage")) {
      permissionsSet.add("project.view");
      permissionsSet.add("project.manage");
    }
    if (extra.includes("report.view.all")) {
      permissionsSet.add("report.view");
      permissionsSet.add("report.view.all");
    }
    if (extra.includes("report.none")) {
      permissionsSet.delete("report.view");
      permissionsSet.delete("report.view.all");
    }
  }

  const permissions = Array.from(permissionsSet);
  return { ...user, permissions };
}

/** Current logged-in user (cached per request) or null. */
export const getCurrentUser = cache(async () => {
  const id = await sessionUserId();
  return id ? loadUser(id) : null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const policy = await getSecurityPolicy();
  if (policy.ipLockEnabled || policy.mobileLockEnabled) {
    const reqCtx = await getRequestSecurityContext(false);
    const decision = evaluateAccessPolicy({
      user,
      policy,
      ip: reqCtx.ip,
      isMobile: reqCtx.isMobile,
    });
    if (!decision.allowed) {
      redirect(
        decision.code === "MOBILE_BLOCKED"
          ? "/login?blocked=mobile"
          : "/login?blocked=ip"
      );
    }
  }

  if (policy.deviceApprovalEnabled) {
    const deviceOk = await verifyActiveSessionDevice({ user, policy });
    if (!deviceOk) {
      redirect("/login?blocked=device");
    }
  }

  return user;
}

export function can(user: { permissions: string[] }, ...perms: string[]) {
  return perms.some((p) => user.permissions.includes(p));
}

export async function requirePermission(...perms: string[]) {
  const user = await requireUser();
  if (!can(user, ...perms)) redirect("/?denied=1");
  return user;
}

export async function clientIp() {
  const h = await headers();
  const raw =
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for") ||
    h.get("x-real-ip") ||
    "";
  return normalizeIp(raw) || null;
}
