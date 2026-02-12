import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SITE_TAGLINE } from "@/lib/app-meta";
import { verifyShareToken } from "@/lib/share-token";
import { getRecapState } from "@/lib/store";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { checkRateLimit, getClientIp, readRateLimitEnv } from "@/lib/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  token: z.string().min(16),
});

function endingLabel(type: string): string {
  if (type === "triumph") {
    return "Victory";
  }
  if (type === "survival") {
    return "Escaped";
  }
  return "Game Over";
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit({
    scope: "og_recap",
    key: ip,
    limit: readRateLimitEnv("RATE_LIMIT_OG_PER_MINUTE", 120),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const query = querySchema.safeParse({
    token: url.searchParams.get("token"),
  });
  if (!query.success) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const payload = await verifyShareToken(query.data.token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  try {
    const recap = getRecapState(payload.code);
    const narratorLine = (recap.latestNarration?.text ?? recap.narrationLog.at(-1)?.text ?? "A wild run from start to finish.").slice(
      0,
      110
    );
    trackEvent("og_image_requested", { code: payload.code });

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px",
            background:
              "radial-gradient(circle at top left, rgba(34,211,238,0.3), transparent 40%), #05070f",
            color: "#e2e8f0",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ letterSpacing: 2, fontSize: 26, opacity: 0.8 }}>STORY CLASH</p>
            <h1 style={{ fontSize: 72, margin: 0, color: "#67e8f9" }}>{endingLabel(recap.endingType)}</h1>
            <p style={{ fontSize: 40, margin: 0 }}>{recap.storyTitle ?? "Unknown Story"}</p>
            <p style={{ fontSize: 28, margin: 0, color: "#cbd5e1", maxWidth: 980 }}>{narratorLine}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 32, display: "flex", flexDirection: "column", gap: 8 }}>
              <span>Room: {payload.code}</span>
              <span>MVP: {recap.mvp.player}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right" }}>
              <p style={{ fontSize: 28, color: "#93c5fd" }}>Join the next run</p>
              <p style={{ fontSize: 20, color: "#94a3b8" }}>{SITE_TAGLINE}</p>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    logger.warn("og.recap_not_available", { code: payload.code, error });
    return NextResponse.json({ error: "Recap unavailable" }, { status: 404 });
  }
}
