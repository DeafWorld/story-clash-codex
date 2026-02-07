import { supabaseAdmin } from "./supabase";

export type RateLimitScope =
  | "confession_daily"
  | "ask_weekly"
  | "binary_daily"
  | "vote_minute"
  | "vote_hour"
  | "flag_hour";

function getWindowStart(scope: RateLimitScope) {
  const now = new Date();
  if (scope === "ask_weekly") {
    const day = now.getUTCDay();
    const diff = (day + 6) % 7; // Monday start
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - diff);
    return start.toISOString();
  }

  if (scope === "vote_hour" || scope === "flag_hour") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
    return start.toISOString();
  }

  if (scope === "vote_minute") {
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes()
      )
    );
    return start.toISOString();
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.toISOString();
}

export async function checkAndIncrementRateLimit(userId: string, scope: RateLimitScope, max: number) {
  const windowStart = getWindowStart(scope);
  const { data, error } = await supabaseAdmin
    .from("rate_limits")
    .select("count, window_start")
    .eq("user_id", userId)
    .eq("scope", scope)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const { error: insertError } = await supabaseAdmin
      .from("rate_limits")
      .insert({ user_id: userId, scope, window_start: windowStart, count: 1 });
    if (insertError) throw insertError;
    return { allowed: true, remaining: max - 1 };
  }

  if (data.window_start !== windowStart) {
    const { error: resetError } = await supabaseAdmin
      .from("rate_limits")
      .update({ window_start: windowStart, count: 1 })
      .eq("user_id", userId)
      .eq("scope", scope);
    if (resetError) throw resetError;
    return { allowed: true, remaining: max - 1 };
  }

  if (data.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  const { error: updateError } = await supabaseAdmin
    .from("rate_limits")
    .update({ count: data.count + 1 })
    .eq("user_id", userId)
    .eq("scope", scope);
  if (updateError) throw updateError;
  return { allowed: true, remaining: max - (data.count + 1) };
}

export async function enforceRateLimits(
  userId: string,
  limits: { scope: RateLimitScope; max: number }[]
) {
  for (const limit of limits) {
    const result = await checkAndIncrementRateLimit(userId, limit.scope, limit.max);
    if (!result.allowed) {\n      return { allowed: false, scope: limit.scope };\n    }\n  }\n  return { allowed: true };\n}
