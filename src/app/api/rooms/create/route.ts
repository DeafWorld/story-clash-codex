import { NextResponse } from "next/server";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp, readRateLimitEnv } from "@/lib/rate-limit";
import { containsProfanity } from "../../../../lib/profanity";
import { createRoom } from "../../../../lib/store";

const createSchema = z.object({
  name: z.string().trim().min(1).max(12),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit({
    scope: "rooms_create",
    key: ip,
    limit: readRateLimitEnv("RATE_LIMIT_CREATE_ROOM_PER_MINUTE", 8),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const body = parsed.data;

    if (containsProfanity(body.name)) {
      return NextResponse.json({ error: "Name contains blocked language" }, { status: 400 });
    }

    const created = createRoom(body.name);
    trackEvent("room_created", { code: created.code });
    logger.info("api.rooms.create.ok", { code: created.code, ip });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error("api.rooms.create.failed", { ip, error });
    return NextResponse.json({ error: "Failed to create room" }, { status: 400 });
  }
}
