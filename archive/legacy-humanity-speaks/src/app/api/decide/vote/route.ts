import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { enforceRateLimits } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/limits";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function POST(request: Request) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const bodySchema = z.object({
    question_id: z.string().uuid(),
    choice: z.enum(["a", "b"]),
  });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }
  const { question_id, choice } = parsed.data;

  const limit = await enforceRateLimits(userId, [
    { scope: "vote_minute", max: LIMITS.voteMinute },
    { scope: "vote_hour", max: LIMITS.voteHour },
  ]);
  if (!limit.allowed) {
    logWarn("decide.vote_rate_limited", { userId });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { error: voteError } = await supabaseAdmin.from("binary_votes").insert({
    user_id: userId,
    question_id,
    choice,
  });

  if (voteError) {
    if (voteError.code === "23505") {
      return NextResponse.json({ error: "Already voted" }, { status: 409 });
    }
    logError("decide.vote_failed", { error: voteError.message });
    return NextResponse.json({ error: "Unable to vote" }, { status: 500 });
  }

  const { data: question, error } = await supabaseAdmin
    .from("binary_questions")
    .select("votes_a, votes_b, question_text, option_a, option_b, id")
    .eq("id", question_id)
    .single();

  if (error || !question) {
    logError("decide.vote_missing", { questionId: question_id });
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const votes_a = question.votes_a + (choice === "a" ? 1 : 0);
  const votes_b = question.votes_b + (choice === "b" ? 1 : 0);

  await supabaseAdmin
    .from("binary_questions")
    .update({ votes_a, votes_b })
    .eq("id", question_id);

  logEvent("decide_voted", { questionId: question_id, choice });
  return NextResponse.json({
    question: { ...question, votes_a, votes_b },
  });
}
