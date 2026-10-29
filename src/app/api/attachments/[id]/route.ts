import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isR2Configured, getFromR2 } from "@/lib/r2";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return new NextResponse("Not Found", { status: 404 });
    }

    let fileBuffer: Uint8Array | null = attachment.data;
    let contentType = attachment.mimeType || "application/octet-stream";

    // If file is stored in Cloudflare R2, fetch from R2
    if (attachment.storageKey && isR2Configured()) {
      try {
        const r2File = await getFromR2(attachment.storageKey);
        fileBuffer = r2File.data;
        if (r2File.mimeType) {
          contentType = r2File.mimeType;
        }
      } catch (r2Err) {
        console.error(`Failed to fetch attachment ${attachment.id} from R2:`, r2Err);
        // If not in R2 and no database fallback data, return 404
        if (!fileBuffer) {
          return new NextResponse("File not found on storage", { status: 404 });
        }
      }
    }

    if (!fileBuffer) {
      return new NextResponse("File data missing", { status: 404 });
    }

    const safeFileName = attachment.fileName.replace(/"/g, "");

    return new NextResponse(fileBuffer as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
      },
    });
  } catch (err: any) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
