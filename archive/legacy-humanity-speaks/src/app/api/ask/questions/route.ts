import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { isPremiumUser } from "@/lib/subscriptions";
import { LIMITS } from "@/lib/limits";
import { checkContentSafety } from "@/lib/moderation";
import { logError, logEvent, logWarn } from "@/lib/logger";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const premium = await isPremiumUser(userId);

  const { data: active } = await supabaseAdmin
    .from("ask_questions")
    .select("id, question_text, votes")
    .eq("status", "active")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pending } = await supabaseAdmin
    .from("ask_questions")
    .select("id, question_text, votes")
    .eq("status", "pending")
    .eq("hidden", false)
    .order("votes", { ascending: false })
    .limit(10);

  let answers = [] as { id: string; answer_text: string; votes: number }[];
  if (active?.id) {
    const { data } = await supabaseAdmin
      .from("ask_answers")
      .select("id, answer_text, votes")
      .eq("ask_question_id", active.id)
      .eq("hidden", false)
      .order("votes", { ascending: false })
      .limit(20);
    answers = data ?? [];
  }

  let premiumTrending = [] as { id: string; question_text: string; votes: number }[];
  if (premium) {
    const { data } = await supabaseAdmin
      .from("ask_questions")
      .select("id, question_text, votes")
      .eq("status", "pending")
      .eq("hidden", false)
      .order("votes", { ascending: false })
      .limit(5);
    premiumTrending = data ?? [];
  }

  return NextResponse.json({
    active_question: active,
    pending_questions: pending ?? [],
    answers,
    premium,
    premium_trending: premiumTrending,
  });
}

export async function POST(request: Request) {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const bodySchema = z.object({ question_text: z.string().min(3).max(180) });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }
  const { question_text } = parsed.data;

  const rate = await checkAndIncrementRateLimit(userId, "ask_weekly", LIMITS.askWeekly);
  if (!rate.allowed) {
    logWarn("ask.question_rate_limited", { userId });
    return NextResponse.json({ error: "Weekly question limit reached" }, { status: 429 });
  }

  const safety = await checkContentSafety(question_text);
  if (!safety.allowed) {
    logWarn("ask.question_blocked", { userId });
    return NextResponse.json({ error: "Content not allowed" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("ask_questions")
    .insert({ question_text, status: "pending" })
    .select("id, question_text, votes")
    .single();

  if (error) {
    logError("ask.question_create_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to submit question" }, { status: 500 });
  }

  logEvent("ask_question_submitted", { questionId: data.id });
  return NextResponse.json({ question: data });
}
