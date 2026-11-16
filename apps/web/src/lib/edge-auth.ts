import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Per-site edge controller credentials. Each site gets its own key; the cloud keeps
 * only a SHA-256 hash, so a database leak does not reveal usable keys, and a key
 * stolen from one site cannot read or write any other site.
 */

const KEY_PREFIX = "wbe_";

export function generateEdgeKey(): { key: string; hash: string; prefix: string } {
  const key = `${KEY_PREFIX}${randomBytes(30).toString("base64url")}`;
  return { key, hash: hashEdgeKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) };
}

export function hashEdgeKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeEdgeKey(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(KEY_PREFIX) && value.length >= 30 && value.length <= 128;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The old single shared SITE_DAEMON_API_KEY. Accepted only when explicitly enabled
 * (ALLOW_LEGACY_SITE_KEY=true) so upgraded installs keep working while their edge
 * controllers are re-keyed; never accepted with a placeholder value.
 */
export function legacySiteKeyMatches(presented: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (env.ALLOW_LEGACY_SITE_KEY !== "true") return false;
  const configured = env.SITE_DAEMON_API_KEY;
  if (!configured || !presented || configured.length < 24 || /change-me|changeme/i.test(configured)) return false;
  return constantTimeEqual(presented, configured);
}
