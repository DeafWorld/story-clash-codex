import { NextResponse } from "next/server";
import { z } from "zod";
import { getRecapState } from "@/lib/store";
import { createShareToken } from "@/lib/share-token";
import { resolveAppUrlFromRequest } from "@/lib/app-url";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp, readRateLimitEnv } from "@/lib/rate-limit";

export const runtime = "nodejs";

const paramsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^[A-Za-z0-9]+$/),
});

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit({
    scope: "share_recap",
    key: ip,
    limit: readRateLimitEnv("RATE_LIMIT_SHARE_PER_MINUTE", 30),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Too many share requests",
        retryAfterMs: limit.retryAfterMs,
      },
      { status: 429 }
    );
  }

  const code = params.data.code.toUpperCase();

  try {
    const recap = getRecapState(code);
    const token = await createShareToken(code);
    const appUrl = resolveAppUrlFromRequest(request);
    const shareUrl = `${appUrl}/share/recap/${code}?token=${encodeURIComponent(token)}`;
    const imageUrl = `${appUrl}/api/og/recap?token=${encodeURIComponent(token)}`;
    const shareText = `We just played Story Clash. Ending: ${recap.endingType.toUpperCase()}. Join the next run.`;

    trackEvent("share_link_created", { code });
    return NextResponse.json(
      {
        code,
        shareText,
        shareUrl,
        imageUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.warn("share.recap_not_available", { code, error });
    return NextResponse.json({ error: "Recap not available" }, { status: 404 });
  }
}
