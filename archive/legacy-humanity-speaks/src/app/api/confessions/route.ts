import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/api";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { isPremiumUser } from "@/lib/subscriptions";
import { LIMITS } from "@/lib/limits";
import { checkContentSafety } from "@/lib/moderation";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const { data, error } = await supabaseAdmin
    .from("confessions")
    .select("id, content, created_at, vote_score, boosted_until")
    .eq("hidden", false)
    .order("boosted_until", { ascending: false, nullsFirst: false })
    .order("vote_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    logError("confessions.fetch_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to fetch confessions" }, { status: 500 });
  }

  return NextResponse.json({ confessions: data });
}

export async function POST(request: Request) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const bodySchema = z.object({ content: z.string().min(1).max(1000) });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  }
  const { content } = parsed.data;

  const premium = await isPremiumUser(userId);
  const limit = premium ? LIMITS.confessionDailyPremium : LIMITS.confessionDaily;

  const rate = await checkAndIncrementRateLimit(userId, "confession_daily", limit);
  if (!rate.allowed) {
    logWarn("confessions.rate_limited", { userId });
    return NextResponse.json({ error: "Daily confession limit reached" }, { status: 429 });
  }

  const safety = await checkContentSafety(content);
  if (!safety.allowed) {
    logWarn("confessions.moderation_blocked", { userId });
    return NextResponse.json({ error: "Content not allowed" }, { status: 400 });
  }

  const anonymousId = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from("confessions")
    .insert({ content: content.trim(), anonymous_id: anonymousId })
    .select("id, content, created_at, vote_score, boosted_until")
    .single();

  if (error) {
    logError("confessions.create_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to save confession" }, { status: 500 });
  }

  logEvent("confession_created", { confessionId: data.id });
  return NextResponse.json({ confession: data });
}
