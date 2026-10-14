import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { signature } = await request.json();

    if (!signature || typeof signature !== "string") {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { signature },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update signature" }, { status: 500 });
  }
}
