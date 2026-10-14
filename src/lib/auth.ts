import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "ims_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

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
  (await cookies()).delete(COOKIE);
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
  const permissions = Array.from(new Set([...user.role.permissions, ...user.extraPermissions]));
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
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
