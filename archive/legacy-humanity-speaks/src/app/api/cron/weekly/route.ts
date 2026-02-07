import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { askToConfessionPrompt } from "@/lib/cross-pollination";
import { logEvent } from "@/lib/logger";

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabaseAdmin
    .from("ask_questions")
    .update({ status: "archived" })
    .eq("status", "active");

  const { data: topPending } = await supabaseAdmin
    .from("ask_questions")
    .select("id, question_text")
    .eq("status", "pending")
    .eq("hidden", false)
    .order("votes", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (topPending) {
    await supabaseAdmin
      .from("ask_questions")
      .update({ status: "active" })
      .eq("id", topPending.id);
  }

  const promptSource = topPending?.question_text;
  if (promptSource) {
    const prompt = askToConfessionPrompt(promptSource);
    await supabaseAdmin.from("confession_prompts").insert({
      prompt_text: prompt,
      status: "active",
    });

    await supabaseAdmin
      .from("confession_prompts")
      .update({ status: "archived" })
      .neq("prompt_text", prompt);
    logEvent("cron.weekly.prompt_set");
  }

  return NextResponse.json({ ok: true });
}
