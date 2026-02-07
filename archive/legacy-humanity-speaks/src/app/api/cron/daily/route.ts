import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { confessionToBinary, binaryToAsk } from "@/lib/cross-pollination";
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
    .from("binary_questions")
    .update({ status: "archived" })
    .eq("status", "active");

  const { data: pending } = await supabaseAdmin
    .from("binary_questions")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    await supabaseAdmin.from("binary_questions").update({ status: "active" }).eq("id", pending.id);
  }

  const { data: confessions } = await supabaseAdmin
    .from("confessions")
    .select("content")
    .eq("hidden", false)
    .order("vote_score", { ascending: false })
    .limit(3);

  if (confessions?.length) {
    const inserts = confessions.map((confession) => {
      const generated = confessionToBinary(confession.content);
      return { ...generated, status: "pending" };
    });
    await supabaseAdmin.from("binary_questions").insert(inserts);
    logEvent("cron.daily.binary_seeded", { count: inserts.length });
  }

  const { data: topBinary } = await supabaseAdmin
    .from("binary_questions")
    .select("question_text, option_a, option_b, votes_a, votes_b")
    .or("votes_a.gt.0,votes_b.gt.0")
    .eq("hidden", false)
    .order("votes_a", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (topBinary) {
    const winner = topBinary.votes_a >= topBinary.votes_b ? topBinary.option_a : topBinary.option_b;
    const ask = binaryToAsk(topBinary.question_text, winner);
    await supabaseAdmin.from("ask_questions").insert({
      question_text: ask.question_text,
      status: "pending",
    });
    logEvent("cron.daily.ask_seeded");
  }

  return NextResponse.json({ ok: true });
}
