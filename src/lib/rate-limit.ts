type RateLimitInput = {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

declare global {
  var __STORY_CLASH_RATE_LIMITS__: Map<string, RateLimitWindow> | undefined;
}

const windows = globalThis.__STORY_CLASH_RATE_LIMITS__ ?? new Map<string, RateLimitWindow>();
globalThis.__STORY_CLASH_RATE_LIMITS__ = windows;

function now() {
  return Date.now();
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

export function readRateLimitEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return raw;
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const key = `${input.scope}:${input.key}`;
  const current = windows.get(key);
  const timestamp = now();

  if (!current || current.resetAt <= timestamp) {
    windows.set(key, {
      count: 1,
      resetAt: timestamp + input.windowMs,
    });
    return {
      ok: true,
      remaining: Math.max(0, input.limit - 1),
      resetAt: timestamp + input.windowMs,
      retryAfterMs: 0,
    };
  }

  if (current.count >= input.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterMs: Math.max(0, current.resetAt - timestamp),
    };
  }

  current.count += 1;
  windows.set(key, current);
  return {
    ok: true,
    remaining: Math.max(0, input.limit - current.count),
    resetAt: current.resetAt,
    retryAfterMs: 0,
  };
}
