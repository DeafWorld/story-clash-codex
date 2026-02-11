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
    const maybeError = context.error;
    if (maybeError instanceof Error) {
      sentry.captureException(maybeError, { tags: { event } });
      return;
    }
    sentry.captureMessage(event, {
      level: "error",
      extra: context,
    });
  } catch {
    // Never throw from logger.
  }
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
