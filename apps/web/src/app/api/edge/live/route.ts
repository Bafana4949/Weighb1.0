import { UserRole } from "@prisma/client";
import { fail,ok,requireRole } from "@/lib/api";
export async function GET(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const daemonUrl = process.env.SITE_DAEMON_URL;
  const isLocalhost = !daemonUrl || daemonUrl.includes("localhost") || daemonUrl.includes("127.0.0.1");
  const isCloud = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE);

  // In cloud deployments without an explicit remote daemon URL, do not hang waiting on localhost:8000
  if (isCloud && isLocalhost) {
    return ok({ state: "MANUAL_MODE", telemetry: null, pending_sync: 0, serial_connected: false });
  }

  const lane = new URL(request.url).searchParams.get("lane");
  const qs = lane ? `?lane=${encodeURIComponent(lane)}` : "";

  try {
    const response = await fetch(`${daemonUrl ?? "http://localhost:8000"}/edge/live${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) throw new Error(`daemon returned ${response.status}`);
    const data = await response.json();
    return ok({ ...data, serial_connected: true });
  } catch (error) {
    return ok({ state: "MANUAL_MODE", telemetry: null, pending_sync: 0, serial_connected: false, error: String(error) });
  }
}
