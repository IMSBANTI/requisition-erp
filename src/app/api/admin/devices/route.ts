import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getRequestSecurityContext, logSecurityAudit } from "@/lib/securityServer";

export async function PATCH(request: Request) {
  try {
    const admin = await requirePermission("admin.users");
    const reqCtx = await getRequestSecurityContext(false);
    const body = await request.json();

    const action = String(body?.action || "");
    const deviceId = String(body?.deviceId || "");
    const customLabel =
      typeof body?.deviceLabel === "string" ? body.deviceLabel.trim() : "";

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    const device = await prisma.trustedDevice.findUnique({
      where: { id: deviceId },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    if (action === "APPROVE") {
      const updated = await prisma.trustedDevice.update({
        where: { id: device.id },
        data: {
          status: "APPROVED",
          deviceLabel: customLabel || device.deviceLabel,
          approvedById: admin.id,
          approvedAt: new Date(),
          revokedAt: null,
        },
      });
      await logSecurityAudit({
        userId: admin.id,
        action: "DEVICE_APPROVED",
        details: `Approved device "${updated.deviceLabel}" for ${device.user.name} (${device.user.email})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json({ success: true, device: updated });
    }

    if (action === "REVOKE") {
      const updated = await prisma.trustedDevice.update({
        where: { id: device.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
        },
      });
      await logSecurityAudit({
        userId: admin.id,
        action: "DEVICE_REVOKED",
        details: `Revoked device "${device.deviceLabel}" for ${device.user.name} (${device.user.email})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json({ success: true, device: updated });
    }

    if (action === "RENAME") {
      if (!customLabel) {
        return NextResponse.json(
          { error: "Device label cannot be empty" },
          { status: 400 }
        );
      }
      const updated = await prisma.trustedDevice.update({
        where: { id: device.id },
        data: { deviceLabel: customLabel },
      });
      return NextResponse.json({ success: true, device: updated });
    }

    if (action === "DELETE") {
      await prisma.trustedDevice.delete({ where: { id: device.id } });
      await logSecurityAudit({
        userId: admin.id,
        action: "DEVICE_DELETED",
        details: `Removed device record "${device.deviceLabel}" for ${device.user.name} (${device.user.email})`,
        ip: reqCtx.ip,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update device status" },
      { status: 500 }
    );
  }
}
