"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientEnvelope, RealtimeEventName, ServerEnvelope } from "../types/realtime";
import { isServerEnvelope } from "../types/realtime";

type RealtimeTransport = "socketio" | "ws";
type Handler = (payload: unknown) => void;

export interface RealtimeClient {
  emit<TPayload = unknown>(event: RealtimeEventName, payload?: TPayload): void;
  on<TPayload = unknown>(event: RealtimeEventName, handler: (payload: TPayload) => void): void;
  off<TPayload = unknown>(event: RealtimeEventName, handler?: (payload: TPayload) => void): void;
  disconnect(): void;
  getTransport(): RealtimeTransport;
}

function normalizeTransport(value: string | undefined): RealtimeTransport {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ws") {
    return "ws";
  }
  return "socketio";
}

function resolveTransport(): RealtimeTransport {
  const explicit = normalizeTransport(process.env.NEXT_PUBLIC_REALTIME_TRANSPORT);
  if (process.env.NEXT_PUBLIC_REALTIME_TRANSPORT) {
    return explicit;
  }
  // Auto-pick WS if a WS base URL is configured; otherwise default to existing local socket.io.
  return process.env.NEXT_PUBLIC_WS_BASE_URL ? "ws" : "socketio";
}

function toWsOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  return url.origin;
}

function resolveWsBaseUrl(): string {
  const explicitWs = process.env.NEXT_PUBLIC_WS_BASE_URL?.trim();
  if (explicitWs) {
    return toWsOrigin(explicitWs);
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (apiBase) {
    return toWsOrigin(apiBase);
  }

  if (typeof window !== "undefined") {
    return toWsOrigin(window.location.origin);
  }

  return "ws://localhost:3000";
}

function safeEnvelopeParse(message: string): ServerEnvelope | null {
  try {
    const parsed = JSON.parse(message) as unknown;
    return isServerEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

class SocketIoRealtimeClient implements RealtimeClient {
  private socket: Socket;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
    this.socket = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
    });
  }

  emit<TPayload = unknown>(event: RealtimeEventName, payload?: TPayload) {
    this.socket.emit(event, payload);
  }

  on<TPayload = unknown>(event: RealtimeEventName, handler: (payload: TPayload) => void) {
    this.socket.on(event, handler as Handler);
  }

  off<TPayload = unknown>(event: RealtimeEventName, handler?: (payload: TPayload) => void) {
    if (handler) {
      this.socket.off(event, handler as Handler);
      return;
    }
    this.socket.off(event);
  }

  disconnect() {
    this.socket.disconnect();
  }

  getTransport(): RealtimeTransport {
    return "socketio";
  }
}

class NativeWsRealtimeClient implements RealtimeClient {
  private ws: WebSocket | null = null;

  private handlers = new Map<string, Set<Handler>>();

  private queue: ClientEnvelope[] = [];

  private reconnectAttempts = 0;

  private reconnectTimer: number | null = null;

  private shouldReconnect = true;

  private lastJoinPayload: unknown = null;

  private currentCode = "";

  private currentPlayerId = "";

  private hasConnectedAtLeastOnce = false;

  private reconnecting = false;

  constructor() {}

  private connect(code: string, playerId: string) {
    this.currentCode = code;
    this.currentPlayerId = playerId;
    const base = resolveWsBaseUrl();
    const params = new URLSearchParams({ code, playerId });
    const wsUrl = `${base}/ws?${params.toString()}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.flushQueue();
      if (this.reconnecting && this.lastJoinPayload && this.currentCode && this.currentPlayerId) {
        this.sendEnvelope({ event: "join_room", data: this.lastJoinPayload });
      }
      this.hasConnectedAtLeastOnce = true;
      this.reconnecting = false;
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      const parsed = safeEnvelopeParse(event.data);
      if (!parsed) {
        return;
      }
      this.dispatch(parsed.event, parsed.data);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.shouldReconnect) {
        return;
      }
      this.reconnecting = this.hasConnectedAtLeastOnce;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.dispatch("server_error", { message: "Realtime connection error" });
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }

    const attempt = Math.min(this.reconnectAttempts, 8);
    const delay = Math.min(5000, 400 * 2 ** attempt);
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentCode && this.currentPlayerId) {
        this.connect(this.currentCode, this.currentPlayerId);
      }
    }, delay);
  }

  private sendEnvelope(envelope: ClientEnvelope) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(envelope);
      return;
    }
    this.ws.send(JSON.stringify(envelope));
  }

  private flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      this.ws.send(JSON.stringify(next));
    }
  }

  private dispatch(event: RealtimeEventName, payload: unknown) {
    const scoped = this.handlers.get(event);
    if (!scoped || scoped.size === 0) {
      return;
    }
    scoped.forEach((handler) => handler(payload));
  }

  emit<TPayload = unknown>(event: RealtimeEventName, payload?: TPayload): void {
    if (event === "join_room") {
      this.lastJoinPayload = payload ?? null;
      const details = payload as { code?: string; playerId?: string } | undefined;
      const code = details?.code?.toUpperCase().trim();
      const playerId = details?.playerId?.trim();
      if (code && playerId && (!this.ws || this.currentCode !== code || this.currentPlayerId !== playerId)) {
        this.shouldReconnect = true;
        this.reconnecting = false;
        this.hasConnectedAtLeastOnce = false;
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this.connect(code, playerId);
      }
    }
    if (event === "leave_room") {
      this.lastJoinPayload = null;
      this.currentCode = "";
      this.currentPlayerId = "";
      this.shouldReconnect = false;
      this.queue = [];
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.hasConnectedAtLeastOnce = false;
      this.reconnecting = false;
      return;
    }
    this.sendEnvelope({
      event,
      data: payload,
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined,
    });
  }

  on<TPayload = unknown>(event: RealtimeEventName, handler: (payload: TPayload) => void): void {
    const existing = this.handlers.get(event) ?? new Set<Handler>();
    existing.add(handler as Handler);
    this.handlers.set(event, existing);
  }

  off<TPayload = unknown>(event: RealtimeEventName, handler?: (payload: TPayload) => void): void {
    const existing = this.handlers.get(event);
    if (!existing) {
      return;
    }
    if (!handler) {
      this.handlers.delete(event);
      return;
    }
    existing.delete(handler as Handler);
    if (existing.size === 0) {
      this.handlers.delete(event);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.queue = [];
    this.lastJoinPayload = null;
    this.currentCode = "";
    this.currentPlayerId = "";
    this.hasConnectedAtLeastOnce = false;
    this.reconnecting = false;
  }

  getTransport(): RealtimeTransport {
    return "ws";
  }
}

let singleton: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (singleton) {
    return singleton;
  }

  const transport = resolveTransport();
  singleton = transport === "ws" ? new NativeWsRealtimeClient() : new SocketIoRealtimeClient();
  return singleton;
}
