type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLogThreshold(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (raw && raw in LEVEL_WEIGHTS) {
    return LEVEL_WEIGHTS[raw];
  }
  return process.env.NODE_ENV === "production" ? LEVEL_WEIGHTS.info : LEVEL_WEIGHTS.debug;
}

function sanitizeError(value: unknown): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
}

function toStructuredLine(level: LogLevel, event: string, context: LogContext) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  });
}

async function reportToSentry(event: string, context: LogContext) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }
  try {
    const sentry = await import("@sentry/nextjs");
    const tags = buildSentryTags(event, context);
    const maybeError = context.error;
    const extra: LogContext = { ...context };
    delete extra.error;
    if (maybeError instanceof Error) {
      sentry.captureException(maybeError, { tags, extra });
      return;
    }
    sentry.captureMessage(event, {
      level: "error",
      tags,
      extra,
    });
  } catch {
    // Never throw from logger.
  }
}

function toTagValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function firstTagValue(context: LogContext, keys: string[]): string | undefined {
  for (const key of keys) {
    if (!(key in context)) {
      continue;
    }
    const tag = toTagValue(context[key]);
    if (tag) {
      return tag;
    }
  }
  return undefined;
}

export function buildSentryTags(event: string, context: LogContext): Record<string, string> {
  const tags: Record<string, string> = {
    event,
  };

  const roomCode = firstTagValue(context, ["roomCode", "room_code", "code", "room"]);
  if (roomCode) {
    tags.room_code = roomCode;
  }

  const phase = firstTagValue(context, ["phase"]);
  if (phase) {
    tags.phase = phase;
  }

  const gmPhase = firstTagValue(context, ["gmPhase", "gm_phase"]);
  if (gmPhase) {
    tags.gm_phase = gmPhase;
  }

  const transport = firstTagValue(context, ["transport"]);
  if (transport) {
    tags.transport = transport;
  }

  const sessionMode = firstTagValue(context, ["sessionMode", "session_mode"]);
  if (sessionMode) {
    tags.session_mode = sessionMode;
  }

  const socketEvent = firstTagValue(context, ["socketEvent", "socket_event"]);
  if (socketEvent) {
    tags.socket_event = socketEvent;
  }

  const failureMode = firstTagValue(context, ["failureMode", "failure_mode"]);
  if (failureMode) {
    tags.failure_mode = failureMode;
  }

  const source = firstTagValue(context, ["source"]);
  if (source) {
    tags.source = source;
  }

  return tags;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHTS[level] >= currentLogThreshold();
}

export function log(level: LogLevel, event: string, context: LogContext = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const normalizedContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, sanitizeError(value)])
  );
  const line = toStructuredLine(level, event, normalizedContext);

  if (level === "error") {
    console.error(line);
    void reportToSentry(event, context);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug: (event: string, context?: LogContext) => log("debug", event, context),
  info: (event: string, context?: LogContext) => log("info", event, context),
  warn: (event: string, context?: LogContext) => log("warn", event, context),
  error: (event: string, context?: LogContext) => log("error", event, context),
};
