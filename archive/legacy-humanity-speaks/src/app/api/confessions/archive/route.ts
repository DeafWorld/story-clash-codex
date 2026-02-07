import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { isPremiumUser } from "@/lib/subscriptions";
import { logError } from "@/lib/logger";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const premium = await isPremiumUser(userId);
  if (!premium) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("confessions")
    .select("id, content, created_at, vote_score")
    .eq("hidden", false)
    .order("vote_score", { ascending: false })
    .limit(50);

  if (error) {
    logError("confessions.archive_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to load archive" }, { status: 500 });
  }

  return NextResponse.json({ confessions: data });
}
