import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { isPremiumUser } from "@/lib/subscriptions";
import { LIMITS } from "@/lib/limits";
import { checkContentSafety } from "@/lib/moderation";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function POST(request: Request) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const bodySchema = z.object({
    question_text: z.string().min(3).max(140),
    option_a: z.string().min(1).max(40),
    option_b: z.string().min(1).max(40),
  });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Question and options required" }, { status: 400 });
  }
  const { question_text, option_a, option_b } = parsed.data;

  const premium = await isPremiumUser(userId);
  if (!premium) {
    const rate = await checkAndIncrementRateLimit(userId, "binary_daily", LIMITS.binaryDaily);
    if (!rate.allowed) {
      logWarn("decide.question_rate_limited", { userId });
      return NextResponse.json({ error: "Daily question limit reached" }, { status: 429 });
    }
  }

  const safety = await checkContentSafety(`${question_text} ${option_a} ${option_b}`);
  if (!safety.allowed) {
    logWarn("decide.question_blocked", { userId });
    return NextResponse.json({ error: "Content not allowed" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("binary_questions")
    .insert({
      question_text,
      option_a,
      option_b,
      status: "pending",
    })
    .select("id, question_text, option_a, option_b, votes_a, votes_b")
    .single();

  if (error) {
    logError("decide.question_create_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to submit question" }, { status: 500 });
  }

  logEvent("binary_question_submitted", { questionId: data.id });
  return NextResponse.json({ question: data });
}
