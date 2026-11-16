import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/api";

// Server-side proxy to the local NFC bridge (tools/nfc-bridge). The browser
// calls this same-origin route, and the Next.js server (running on the same
// machine as the bridge) forwards to 127.0.0.1. This avoids the browser's
// cross-origin / Private Network Access / mixed-content restrictions that
// block a page from calling 127.0.0.1 directly.
//
// Only staff who issue or verify cards may drive the reader.

const BRIDGE = process.env.NFC_BRIDGE_URL || "http://127.0.0.1:7777";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const timeout = Math.min(Number(url.searchParams.get("timeout")) || 15000, 60000);
  const debug = url.searchParams.get("debug") === "1";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout + 4000);
  try {
    const res = await fetch(`${BRIDGE}/uid?timeout=${timeout}${debug ? "&debug=1" : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "Unexpected response from the card-scanner bridge." }));
    return NextResponse.json(body, { status: res.status });
  } catch (_e) {
    return NextResponse.json(
      { error: "Can't reach the card-scanner bridge. Start it with `npm run nfc-bridge`." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
