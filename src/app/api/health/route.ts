import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET() {
  const payload = {
    status: "ok",
    service: "story-clash-codex",
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev",
    nodeEnv: process.env.NODE_ENV ?? "development",
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  logger.debug("health.check", payload);
  return NextResponse.json(payload, { status: 200 });
}
