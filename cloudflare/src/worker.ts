import { containsProfanity, sanitizeDisplayName } from "./profanity";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./room-code";
import { RoomDurableObject } from "./room-do";

type Env = {
  ROOM_DO: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
  };
  ALLOWED_ORIGINS?: string;
  FRONTEND_URL?: string;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

const CORS_BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function now() {
  return Date.now();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function normalizeFrontendUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS_BASE_HEADERS).forEach(([key, value]) => headers.set(key, value));
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveRequestIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for") ?? "unknown";
}

function allowByRate(key: string, limit: number, windowMs: number): boolean {
  const current = rateBuckets.get(key);
  const timestamp = now();
  if (!current || current.resetAt <= timestamp) {
    rateBuckets.set(key, { count: 1, resetAt: timestamp + windowMs });
    return true;
  }
  if (current.count >= limit) {
    return false;
  }
  current.count += 1;
  rateBuckets.set(key, current);
  return true;
}

function getRoomStub(env: Env, code: string) {
  const normalized = normalizeRoomCode(code);
  const id = env.ROOM_DO.idFromName(normalized);
  return env.ROOM_DO.get(id);
}

async function forwardToRoom(
  env: Env,
  code: string,
  path: string,
  init?: RequestInit,
  body?: unknown
): Promise<Response> {
  const stub = getRoomStub(env, code);
  const headers = new Headers(init?.headers ?? {});
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return stub.fetch(`https://room${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function requestOrigin(request: Request): string | null {
  return request.headers.get("Origin");
}

function isOriginAllowed(origin: string | null, allowList: string[]): boolean {
  if (!origin || allowList.length === 0) {
    return true;
  }
  return allowList.includes(origin);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = requestOrigin(request);
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (!isOriginAllowed(origin, allowedOrigins)) {
      return withCors(error("Origin not allowed", 403), origin);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const ip = resolveRequestIp(request);

    if (path === "/healthz" && request.method === "GET") {
      return withCors(json({ ok: true, runtime: "cloudflare-workers" }), origin);
    }

    if (path === "/" && request.method === "GET") {
      const frontendUrl = normalizeFrontendUrl(env.FRONTEND_URL);
      if (frontendUrl) {
        return Response.redirect(frontendUrl, 302);
      }
      return withCors(
        json({
          ok: true,
          service: "story-clash-api",
          message: "This is the API backend. Open your frontend app URL to play.",
          health: "/healthz",
        }),
        origin
      );
    }

    if (path === "/ws" && request.method === "GET") {
      if (!allowByRate(`ws:${ip}`, 45, 60_000)) {
        return withCors(error("Too many realtime connection attempts", 429), origin);
      }

      const code = normalizeRoomCode(url.searchParams.get("code") ?? "");
      const playerId = (url.searchParams.get("playerId") ?? "").trim();

      if (!isValidRoomCode(code)) {
        return withCors(error("Invalid room code", 400), origin);
      }
      if (!playerId) {
        return withCors(error("Missing player id", 400), origin);
      }

      const stub = getRoomStub(env, code);
      const wsParams = new URLSearchParams({ code, playerId });
      return stub.fetch(new Request(`https://room/ws?${wsParams.toString()}`, request));
    }

    if (path === "/api/rooms/create" && request.method === "POST") {
      if (!allowByRate(`create:${ip}`, 12, 60 * 60 * 1000)) {
        return withCors(error("Rate limit exceeded for room creation", 429), origin);
      }

      const body = (await request.json()) as { name?: string };
      const name = sanitizeDisplayName(body?.name ?? "");

      if (!name) {
        return withCors(error("Display name is required", 400), origin);
      }
      if (containsProfanity(name)) {
        return withCors(error("Name contains blocked language", 400), origin);
      }

      for (let i = 0; i < 70; i += 1) {
        const code = generateRoomCode();
        const response = await forwardToRoom(env, code, "/internal/create", { method: "POST" }, { name, code });
        if (response.status === 409) {
          continue;
        }
        return withCors(response, origin);
      }

      return withCors(error("Failed to generate room code", 500), origin);
    }

    if (path === "/api/rooms/join" && request.method === "POST") {
      if (!allowByRate(`join:${ip}`, 80, 10 * 60 * 1000)) {
        return withCors(error("Too many join attempts", 429), origin);
      }
      const body = (await request.json()) as { code?: string; name?: string };
      const code = normalizeRoomCode(body?.code ?? "");
      const name = sanitizeDisplayName(body?.name ?? "");

      if (!isValidRoomCode(code)) {
        return withCors(error("Room not found", 404), origin);
      }
      if (!name) {
        return withCors(error("Display name is required", 400), origin);
      }
      if (containsProfanity(name)) {
        return withCors(error("Name contains blocked language", 400), origin);
      }

      const response = await forwardToRoom(env, code, "/internal/join", { method: "POST" }, { name });
      return withCors(response, origin);
    }

    if (path.startsWith("/api/rooms/") && request.method === "GET") {
      const code = normalizeRoomCode(path.split("/").pop() ?? "");
      if (!isValidRoomCode(code)) {
        return withCors(error("Room not found", 404), origin);
      }
      const response = await forwardToRoom(env, code, "/internal/room", { method: "GET" });
      return withCors(response, origin);
    }

    if (path.startsWith("/api/game/") && request.method === "GET") {
      const code = normalizeRoomCode(path.split("/").pop() ?? "");
      if (!isValidRoomCode(code)) {
        return withCors(error("Game not found", 404), origin);
      }
      const response = await forwardToRoom(env, code, "/internal/game", { method: "GET" });
      return withCors(response, origin);
    }

    if (path.startsWith("/api/recap/") && request.method === "GET") {
      const code = normalizeRoomCode(path.split("/").pop() ?? "");
      if (!isValidRoomCode(code)) {
        return withCors(error("Recap not found", 404), origin);
      }
      const response = await forwardToRoom(env, code, "/internal/recap", { method: "GET" });
      return withCors(response, origin);
    }

    return withCors(error("Not found", 404), origin);
  },
};

export default worker;
export { RoomDurableObject };
