import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { enforceRateLimits } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/limits";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const idSchema = z.string().uuid();
  const idParsed = idSchema.safeParse(params.id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid question id" }, { status: 400 });
  }

  const limit = await enforceRateLimits(userId, [
    { scope: "vote_minute", max: LIMITS.voteMinute },
    { scope: "vote_hour", max: LIMITS.voteHour },
  ]);
  if (!limit.allowed) {
    logWarn("ask.vote_rate_limited", { userId });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { error: voteError } = await supabaseAdmin
    .from("ask_votes")
    .insert({ user_id: userId, ask_question_id: params.id });

  if (voteError) {
    if (voteError.code === "23505") {
      return NextResponse.json({ error: "Already voted" }, { status: 409 });
    }
    logError("ask.vote_failed", { error: voteError.message });
    return NextResponse.json({ error: "Unable to vote" }, { status: 500 });
  }

  const { data: question, error } = await supabaseAdmin
    .from("ask_questions")
    .select("votes")
    .eq("id", params.id)
    .single();

  if (error) {
    logError("ask.vote_missing", { questionId: params.id });
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const nextVotes = (question.votes ?? 0) + 1;
  await supabaseAdmin.from("ask_questions").update({ votes: nextVotes }).eq("id", params.id);

  logEvent("ask_question_voted", { questionId: params.id });
  return NextResponse.json({ votes: nextVotes });
}
