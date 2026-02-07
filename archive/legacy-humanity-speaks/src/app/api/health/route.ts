import { NextResponse } from "next/server";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
];

export async function GET() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, missing },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
