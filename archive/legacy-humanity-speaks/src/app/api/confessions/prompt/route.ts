import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/api";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const { data } = await supabaseAdmin
    .from("confession_prompts")
    .select("prompt_text")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    prompt: data?.prompt_text ?? "What’s weighing on you today?",
  });
}
