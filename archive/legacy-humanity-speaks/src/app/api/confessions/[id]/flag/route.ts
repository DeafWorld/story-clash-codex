import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase";
import { LIMITS } from "@/lib/limits";
import { enforceRateLimits } from "@/lib/rate-limit";
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
    return NextResponse.json({ error: "Invalid confession id" }, { status: 400 });
  }

  const limit = await enforceRateLimits(userId, [
    { scope: "flag_hour", max: LIMITS.flagHourly },
  ]);
  if (!limit.allowed) {
    logWarn("confessions.flag_rate_limited", { userId });
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { error: flagError } = await supabaseAdmin.from("flags").insert({
    user_id: userId,
    content_type: "confession",
    content_id: params.id,
  });

  if (flagError) {
    if (flagError.code === "23505") {
      return NextResponse.json({ error: "Already flagged" }, { status: 409 });
    }
    logError("confessions.flag_failed", { error: flagError.message });
    return NextResponse.json({ error: "Unable to flag" }, { status: 500 });
  }

  const { data: confession, error } = await supabaseAdmin
    .from("confessions")
    .select("flag_count")
    .eq("id", params.id)
    .single();

  if (error) {
    logError("confessions.flag_not_found", { confessionId: params.id });
    return NextResponse.json({ error: "Confession not found" }, { status: 404 });
  }

  const nextCount = (confession.flag_count ?? 0) + 1;
  const hidden = nextCount >= LIMITS.flagThreshold;

  await supabaseAdmin
    .from("confessions")
    .update({ flag_count: nextCount, hidden })
    .eq("id", params.id);

  logEvent("confession_flagged", { confessionId: params.id, hidden });
  return NextResponse.json({ flag_count: nextCount, hidden });
}
