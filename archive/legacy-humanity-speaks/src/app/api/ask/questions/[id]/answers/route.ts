import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { checkContentSafety } from "@/lib/moderation";
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
    return NextResponse.json({ error: "Invalid question id" }, { status: 400 });
  }

  const bodySchema = z.object({ answer_text: z.string().min(1).max(800) });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Answer required" }, { status: 400 });
  }
  const { answer_text } = parsed.data;

  const limit = await enforceRateLimits(userId, [
    { scope: "vote_minute", max: LIMITS.voteMinute },
    { scope: "vote_hour", max: LIMITS.voteHour },
  ]);
  if (!limit.allowed) {
    logWarn("ask.answer_rate_limited", { userId });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const safety = await checkContentSafety(answer_text);
  if (!safety.allowed) {
    logWarn("ask.answer_blocked", { userId });
    return NextResponse.json({ error: "Content not allowed" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("ask_answers")
    .insert({
      ask_question_id: params.id,
      user_id: userId,
      answer_text,
    })
    .select("id, answer_text, votes")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already answered" }, { status: 409 });
    }
    logError("ask.answer_create_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to submit answer" }, { status: 500 });
  }

  logEvent("ask_answer_submitted", { answerId: data.id, questionId: params.id });
  return NextResponse.json({ answer: data });
}
