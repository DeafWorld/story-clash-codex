type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel) {
  const configured = (process.env.LOG_LEVEL || "info") as LogLevel;
  return levels[level] >= (levels[configured] ?? levels.info);
}

function log(level: LogLevel, event: string, payload?: LogPayload) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export function logDebug(event: string, payload?: LogPayload) {
  log("debug", event, payload);
}

export function logInfo(event: string, payload?: LogPayload) {
  log("info", event, payload);
}

export function logWarn(event: string, payload?: LogPayload) {
  log("warn", event, payload);
}

export function logError(event: string, payload?: LogPayload) {
  log("error", event, payload);
  if (process.env.SENTRY_DSN) {
    void import("@sentry/nextjs").then((Sentry) => {
      const error = payload?.error ?? event;
      Sentry.captureException(error, { extra: payload });
    });
  }
}

export function logEvent(event: string, payload?: LogPayload) {
  log("info", `event:${event}`, payload);
}
