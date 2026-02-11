import { NextResponse } from "next/server";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp, readRateLimitEnv } from "@/lib/rate-limit";
import { containsProfanity } from "../../../../lib/profanity";
import { joinRoom } from "../../../../lib/store";

const joinSchema = z.object({
  code: z.string().trim().min(4).max(4),
  name: z.string().trim().min(1).max(12),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit({
    scope: "rooms_join",
    key: ip,
    limit: readRateLimitEnv("RATE_LIMIT_JOIN_ROOM_PER_MINUTE", 20),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = joinSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }
    const body = parsed.data;

    if (containsProfanity(body.name)) {
      return NextResponse.json({ error: "Name contains blocked language" }, { status: 400 });
    }

    const joined = joinRoom(body.code, body.name);
    trackEvent("room_joined", { code: body.code.toUpperCase() });
    logger.info("api.rooms.join.ok", { code: body.code.toUpperCase(), ip });
    return NextResponse.json(joined, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    logger.warn("api.rooms.join.failed", { ip, error, message });
    const status = message.includes("full") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
