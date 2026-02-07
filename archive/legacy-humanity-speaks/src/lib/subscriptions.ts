import { supabaseAdmin } from "./supabase";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function isPremiumUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  if (!ACTIVE_STATUSES.has(data.status || "")) return false;
  if (!data.current_period_end) return true;

  return new Date(data.current_period_end).getTime() > Date.now();
}
