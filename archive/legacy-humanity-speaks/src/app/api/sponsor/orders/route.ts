import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/logger";

export async function GET() {
  const { userId, response } = await requireUser();
  if (!userId) return response!;

  const { data, error } = await supabaseAdmin
    .from("sponsored_orders")
    .select(
      "id, question_text, option_a, option_b, tier, status, created_at, binary_question_id, binary_questions(votes_a, votes_b, id, created_at)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    logError("sponsor.orders_fetch_failed", { error: error.message });
    return NextResponse.json({ error: "Unable to load sponsored orders" }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
