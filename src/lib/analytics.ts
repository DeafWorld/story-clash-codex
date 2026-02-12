import { logger } from "./logger";

export type AnalyticsEventName =
  | "room_created"
  | "room_joined"
  | "game_started"
  | "minigame_score_submitted"
  | "minigame_spin_resolved"
  | "genre_selected"
  | "choice_submitted"
  | "turn_timed_out"
  | "game_completed"
  | "session_restarted"
  | "invite_clicked"
  | "invite_shared"
  | "invite_copied"
  | "invite_opened"
  | "join_prefilled"
  | "narrator_line_emitted"
  | "recap_shared"
  | "play_again_clicked"
  | "back_clicked"
  | "share_link_created"
  | "og_image_requested"
  | "cron_daily";

type AnalyticsEvent = {
  name: AnalyticsEventName;
  at: string;
  properties: Record<string, unknown>;
};

type AnalyticsStore = {
  counters: Map<string, number>;
  recent: AnalyticsEvent[];
};

declare global {
  var __STORY_CLASH_ANALYTICS__: AnalyticsStore | undefined;
}

const MAX_RECENT_EVENTS = 300;
const PLAUSIBLE_API = "https://plausible.io/api/event";

const store: AnalyticsStore = globalThis.__STORY_CLASH_ANALYTICS__ ?? {
  counters: new Map<string, number>(),
  recent: [],
};

globalThis.__STORY_CLASH_ANALYTICS__ = store;

function nowIso() {
  return new Date().toISOString();
}

function toPlausibleEventName(name: AnalyticsEventName): string {
  return `story_${name}`;
}

async function forwardToPlausible(name: AnalyticsEventName): Promise<void> {
  const domain = process.env.PLAUSIBLE_DOMAIN?.trim() || process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (!domain) {
    return;
  }

  try {
    await fetch(PLAUSIBLE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "story-clash-codex/1.0",
      },
      body: JSON.stringify({
        name: toPlausibleEventName(name),
        url: process.env.APP_URL ?? "https://story-clash.invalid",
        domain,
      }),
    });
  } catch (error) {
    logger.warn("analytics.plausible_failed", { error });
  }
}

export function trackEvent(name: AnalyticsEventName, properties: Record<string, unknown> = {}) {
  const event: AnalyticsEvent = {
    name,
    at: nowIso(),
    properties,
  };

  store.recent.push(event);
  if (store.recent.length > MAX_RECENT_EVENTS) {
    store.recent.shift();
  }

  const nextCount = (store.counters.get(name) ?? 0) + 1;
  store.counters.set(name, nextCount);

  logger.info("analytics.event", {
    name,
    count: nextCount,
    properties,
  });

  void forwardToPlausible(name);
}

export function getAnalyticsSnapshot() {
  return {
    counters: Object.fromEntries(store.counters.entries()),
    recent: [...store.recent].reverse(),
  };
}
