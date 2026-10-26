import { UserRole } from "@prisma/client";
import { ok, requireRole } from "@/lib/api";
import { daemonHeaders, daemonSiteFor, daemonUrl } from "@/lib/edge-proxy";

const MANUAL_MODE = { state: "MANUAL_MODE", telemetry: null, pending_sync: 0, serial_connected: false };

export async function GET(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  // Without a co-located edge controller the console runs in manual mode.
  const site = await daemonSiteFor(a.session!.user);
  if (!site) return ok(MANUAL_MODE);
  const lane = new URL(request.url).searchParams.get("lane");
  const qs = lane ? `?lane=${encodeURIComponent(lane)}` : "";
  try {
    const response = await fetch(daemonUrl(`/edge/live${qs}`), { cache: "no-store", headers: daemonHeaders(), signal: AbortSignal.timeout(1000) });
    if (!response.ok) return ok(MANUAL_MODE);
    return ok({ ...(await response.json()), site: site.code, serial_connected: true });
  } catch {
    return ok(MANUAL_MODE);
  }
}
