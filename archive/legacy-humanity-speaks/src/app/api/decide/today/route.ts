import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";

async function fetchActiveQuestion() {
  const { data } = await supabaseAdmin
    .from("binary_questions")
    .select("id, question_text, option_a, option_b, votes_a, votes_b")
    .eq("status", "active")
    .eq("hidden", false)
    .order("featured_until", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  let question = await fetchActiveQuestion();

  if (!question) {
    const { data: pending } = await supabaseAdmin
      .from("binary_questions")
      .select("id")
      .eq("status", "pending")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending) {
      await supabaseAdmin
        .from("binary_questions")
        .update({ status: "active" })
        .eq("id", pending.id);
    } else {
      const { data: created } = await supabaseAdmin
        .from("binary_questions")
        .insert({
          question_text: "Start the conversation: Coffee or Tea?",
          option_a: "Coffee",
          option_b: "Tea",
          status: "active",
        })
        .select("id, question_text, option_a, option_b, votes_a, votes_b")
        .single();
      question = created;
      if (!created) {
        logError("decide.seed_failed");
      }
    }
  }

  if (!question) {
    question = await fetchActiveQuestion();
  }

  return NextResponse.json({ question });
}
