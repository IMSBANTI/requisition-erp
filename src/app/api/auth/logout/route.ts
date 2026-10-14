import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

function getRedirectUrl(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";

  if (host && !host.includes("localhost")) {
    return `${proto}://${host}/login`;
  }

  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) {
    return `${process.env.APP_URL.replace(/\/$/, "")}/login`;
  }

  return new URL("/login", request.url).toString();
}

export async function POST(request: Request) {
  await destroySession();

  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ success: true, redirect: "/login" });
  }

  return NextResponse.redirect(getRedirectUrl(request), 303);
}

export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(getRedirectUrl(request), 303);
}
