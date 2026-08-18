type Level = "debug" | "info" | "warn" | "error";

// Field names that must never reach a log line, however deeply nested the
// caller's fields object is. Matched case-insensitively against the key.
const REDACT_KEY_PATTERN = /password|passwordhash|token|secret|databaseurl|database_url|apikey|api_key|siteapikey|site_api_key|idnumber|id_number|authsecret/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...(fields ? (redact(fields) as Record<string, unknown>) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Minimal dependency-free structured (JSON-line) logger. Every field object
 * passed in is redacted recursively before it's serialised — callers do not
 * need to remember to scrub secrets themselves, but should still avoid
 * passing whole Prisma rows (driver ID documents, etc.) where a specific
 * field would do.
 */
export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
