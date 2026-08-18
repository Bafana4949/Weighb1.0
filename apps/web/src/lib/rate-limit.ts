import { NextResponse } from "next/server";

/** Kept to a plain Request (not NextRequest) so every route handler in this codebase — most of which type their parameter as the base Request — can call this without a type mismatch. */
function requestIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}

/**
 * In-memory fixed-window rate limiter. Deliberately simple: this process runs
 * as a single Node instance (see docker-compose.yml / Vercel deployment) —
 * if this app is ever horizontally scaled across multiple instances, this
 * needs to move to a shared store (Redis) since each instance would
 * otherwise track its own independent counters. Documented here rather than
 * built speculatively, since that's not our current deployment shape.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so long-running processes don't accumulate an
// unbounded number of stale per-IP entries.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Route-level guard matching the ok()/fail() response convention used
 * throughout apps/web/src/lib/api.ts. Returns a 429 Response to short-circuit
 * on, or null to continue handling the request normally.
 */
export function rateLimitOrFail(request: Request, routeKey: string, limit: number, windowMs: number): NextResponse | null {
  const ip = requestIp(request) ?? "unknown";
  const { allowed, retryAfterSeconds } = checkRateLimit(`${routeKey}:${ip}`, limit, windowMs);
  if (allowed) return null;
  return NextResponse.json(
    { success: false, data: null, error: "Too many requests, please try again shortly" },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}
