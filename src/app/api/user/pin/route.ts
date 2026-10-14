import { NextResponse } from "next/server";
import { requireUser, hashSecret } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { pin } = await request.json();

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    }

    const pinHash = await hashSecret(pin);

    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update PIN" }, { status: 500 });
  }
}
