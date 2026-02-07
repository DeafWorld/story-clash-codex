import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { enforceRateLimits } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/limits";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const idSchema = z.string().uuid();
  const idParsed = idSchema.safeParse(params.id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid confession id" }, { status: 400 });
  }

  const bodySchema = z.object({ vote_value: z.number().int().refine((v) => v === 1 || v === -1) });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }
  const value = parsed.data.vote_value;

  const limit = await enforceRateLimits(userId, [
    { scope: "vote_minute", max: LIMITS.voteMinute },
    { scope: "vote_hour", max: LIMITS.voteHour },
  ]);
  if (!limit.allowed) {
    logWarn("confessions.vote_rate_limited", { userId });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { error: voteError } = await supabaseAdmin
    .from("confession_votes")
    .insert({ user_id: userId, confession_id: params.id, vote_value: value });

  if (voteError) {
    if (voteError.code === "23505") {
      return NextResponse.json({ error: "Already voted" }, { status: 409 });
    }
    logError("confessions.vote_failed", { error: voteError.message });
    return NextResponse.json({ error: "Unable to vote" }, { status: 500 });
  }

  const { data: confession, error } = await supabaseAdmin
    .from("confessions")
    .select("vote_score")
    .eq("id", params.id)
    .single();

  if (error) {
    logError("confessions.vote_confession_missing", { confessionId: params.id });
    return NextResponse.json({ error: "Confession not found" }, { status: 404 });
  }

  const nextScore = (confession.vote_score ?? 0) + value;
  await supabaseAdmin
    .from("confessions")
    .update({ vote_score: nextScore })
    .eq("id", params.id);

  logEvent("confession_voted", { confessionId: params.id, vote: value });
  return NextResponse.json({ vote_score: nextScore });
}
