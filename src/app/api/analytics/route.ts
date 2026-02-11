import { NextResponse } from "next/server";
import { getAnalyticsSnapshot } from "@/lib/analytics";

function isAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) {
    return true;
  }
  const header = request.headers.get("x-admin-key")?.trim();
  return Boolean(header && header === expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getAnalyticsSnapshot(), { status: 200 });
}
