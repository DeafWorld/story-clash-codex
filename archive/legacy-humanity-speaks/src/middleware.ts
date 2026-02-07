import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionCookieName, verifySessionCookie } from "./lib/auth-edge";

const protectedPaths = ["/app", "/admin", "/share", "/api/og"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(sessionCookieName)?.value;
  const session = await verifySessionCookie(token);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("reason", "verify");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/share/:path*", "/api/og/:path*"],
};
