import { NextResponse } from "next/server";
import { getAnalyticsSnapshot, trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return true;
  }
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  trackEvent("cron_daily", {});
  const snapshot = getAnalyticsSnapshot();
  logger.info("cron.daily.ran", {
    counters: snapshot.counters,
    recentEvents: snapshot.recent.length,
  });

  return NextResponse.json(
    {
      ok: true,
      ranAt: new Date().toISOString(),
      counters: snapshot.counters,
      recentEvents: snapshot.recent.length,
    },
    { status: 200 }
  );
}
