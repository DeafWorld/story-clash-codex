import { logWarn } from "./logger";

const provider = (process.env.CONTENT_SAFETY_PROVIDER || "").toLowerCase();

export async function checkContentSafety(text: string) {
  if (!provider) {
    return { allowed: true };
  }

  if (provider === "basic") {
    const blocked = ["hate", "kill yourself", "self harm", "terrorist"];
    const lowered = text.toLowerCase();
    const hit = blocked.find((phrase) => lowered.includes(phrase));
    if (hit) {
      return { allowed: false, reason: "Content flagged" };
    }
    return { allowed: true };
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logWarn("moderation.missing_api_key", { provider });
      return { allowed: true };
    }

    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text }),
    });

    if (!res.ok) {
      logWarn("moderation.request_failed", { status: res.status });
      return { allowed: true };
    }

    const data = await res.json();
    const flagged = Boolean(data?.results?.[0]?.flagged);
    if (flagged) {
      return { allowed: false, reason: "Content flagged" };
    }
    return { allowed: true };
  }

  return { allowed: true };
}
