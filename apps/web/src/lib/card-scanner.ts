"use client";

// Reads card UIDs via the app's own server-side proxy (/api/nfc/uid), which
// forwards to the local NFC bridge (tools/nfc-bridge) on 127.0.0.1. Going
// through the app's origin avoids the browser's cross-origin / Private Network
// Access / mixed-content restrictions on calling 127.0.0.1 directly.
const SCAN_ENDPOINT = "/api/nfc/uid";

/** Uppercase hex, no separators — matches how UIDs are entered/stored. */
export function normalizeUid(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^0-9A-F]/g, "");
}

export class ScannerError extends Error {
  constructor(message: string, readonly kind: "bridge" | "device" | "nocard" | "unknown") {
    super(message);
    this.name = "ScannerError";
  }
}

export type ScanResult = { uid: string; kind?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One short request to the proxy. Returns a UID, or null to keep waiting. */
async function attempt(): Promise<ScanResult | null> {
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(`${SCAN_ENDPOINT}?timeout=3000`, {
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(abort);
  }

  let body: any = null;
  try { body = await response.json(); } catch (_e) { /* ignore */ }

  if (response.status === 408) return null; // no card yet — keep polling
  if (response.status === 401) {
    throw new ScannerError("Your session expired — sign in again to scan cards.", "unknown");
  }
  if (response.status === 502) {
    throw new ScannerError(
      "Can't reach the card-scanner bridge. Start it with `npm run nfc-bridge`, or type the UID in manually.",
      "bridge",
    );
  }
  if (response.status === 503) {
    throw new ScannerError("NFC reader not detected. Check that it's plugged in.", "device");
  }
  if (!response.ok || !body?.uid) {
    throw new ScannerError(body?.error || "Could not read a card UID.", "unknown");
  }
  return { uid: normalizeUid(body.uid), kind: body.kind };
}

/**
 * Poll the reader for up to `timeoutMs` while the operator taps a card.
 * Each underlying request is short, so nothing hangs. Resolves with a
 * normalised UID, or throws a ScannerError with a user-friendly message.
 */
export async function scanCard(timeoutMs = 15000): Promise<ScanResult> {
  const deadline = Date.now() + timeoutMs;
  let transientFailures = 0;
  while (Date.now() < deadline) {
    try {
      const hit = await attempt();
      if (hit) return hit;
      transientFailures = 0;
    } catch (e) {
      if (e instanceof ScannerError) throw e; // terminal (bridge/device/auth)
      // network hiccup / abort — retry a few times before giving up
      if (++transientFailures >= 3) {
        throw new ScannerError(
          "The app server didn't respond. Reload the page and try again, or type the UID in manually.",
          "unknown",
        );
      }
    }
    await sleep(600);
  }
  throw new ScannerError("No card detected — tap a card and try again.", "nocard");
}
