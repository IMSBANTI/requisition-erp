import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { isValidIpOrCidrEntry } from "@/lib/security";
import {
  getRequestSecurityContext,
  getSecurityPolicy,
  logSecurityAudit,
} from "@/lib/securityServer";

export async function GET() {
  try {
    await requirePermission("admin.users");
    const [policy, reqCtx] = await Promise.all([
      getSecurityPolicy(),
      getRequestSecurityContext(false),
    ]);
    return NextResponse.json({
      policy,
      detectedIp: reqCtx.ip || "local",
      deviceSummary: reqCtx.deviceSummary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load security policy" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission("admin.users");
    const reqCtx = await getRequestSecurityContext(false);
    const body = await request.json();

    const ipLockEnabled = Boolean(body?.ipLockEnabled);
    const mobileLockEnabled = Boolean(body?.mobileLockEnabled);
    const enforce2faSensitive = Boolean(body?.enforce2faSensitive);
    const allowSuperAdminBypass = Boolean(body?.allowSuperAdminBypass);
    const deviceApprovalEnabled = Boolean(body?.deviceApprovalEnabled);
    const approvedDeviceSkips2fa =
      body?.approvedDeviceSkips2fa === undefined
        ? true
        : Boolean(body.approvedDeviceSkips2fa);
    const skip2faOnOfficeIp =
      body?.skip2faOnOfficeIp === undefined
        ? true
        : Boolean(body.skip2faOnOfficeIp);
    const trustedDeviceDays = Math.min(
      90,
      Math.max(0, Math.floor(Number(body?.trustedDeviceDays ?? 14)))
    );

    const rawIps: string[] = Array.isArray(body?.allowedIps)
      ? body.allowedIps
      : typeof body?.allowedIps === "string"
      ? body.allowedIps.split(/[\n,;]+/)
      : [];

    const cleanedIps = Array.from(
      new Set(rawIps.map((s) => String(s).trim()).filter(Boolean))
    );

    const invalidIps = cleanedIps.filter((entry) => !isValidIpOrCidrEntry(entry));
    if (invalidIps.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid IP or CIDR entry: ${invalidIps.join(", ")}. Examples: 103.10.20.30 or 103.10.20.0/29`,
        },
        { status: 400 }
      );
    }

    if (ipLockEnabled && cleanedIps.length === 0) {
      return NextResponse.json(
        {
          error:
            "Please add at least one authorized Office IP or CIDR range before enabling Office IP Lock.",
        },
        { status: 400 }
      );
    }

    const saved = await prisma.securityPolicy.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ipLockEnabled,
        allowedIps: cleanedIps,
        mobileLockEnabled,
        enforce2faSensitive,
        trustedDeviceDays,
        allowSuperAdminBypass,
        deviceApprovalEnabled,
        approvedDeviceSkips2fa,
        skip2faOnOfficeIp,
        updatedById: admin.id,
      },
      update: {
        ipLockEnabled,
        allowedIps: cleanedIps,
        mobileLockEnabled,
        enforce2faSensitive,
        trustedDeviceDays,
        allowSuperAdminBypass,
        deviceApprovalEnabled,
        approvedDeviceSkips2fa,
        skip2faOnOfficeIp,
        updatedById: admin.id,
      },
    });

    await logSecurityAudit({
      userId: admin.id,
      action: "SECURITY_POLICY_UPDATED",
      details: `IP Lock: ${ipLockEnabled ? `ON (${cleanedIps.length} entries)` : "OFF"} | Mobile Lock: ${mobileLockEnabled ? "ON" : "OFF"} | Device Approval: ${deviceApprovalEnabled ? "ON" : "OFF"} (Skip 2FA: ${approvedDeviceSkips2fa ? "ON" : "OFF"}) | Mandatory 2FA: ${enforce2faSensitive ? "ON" : "OFF"}`,
      ip: reqCtx.ip,
    });

    return NextResponse.json({ success: true, policy: saved });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save security policy" },
      { status: 500 }
    );
  }
}
