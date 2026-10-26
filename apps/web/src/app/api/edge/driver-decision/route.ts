import { UserRole } from "@prisma/client";
import { z } from "zod";
import { fail, ok, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { daemonHeaders, daemonSiteFor, daemonUrl } from "@/lib/edge-proxy";

const schema = z.object({ decision: z.enum(["ACCEPT", "RELOAD"]), lane: z.string().max(40).optional() });

export async function POST(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid driver decision", 422);
  const site = await daemonSiteFor(a.session!.user);
  if (!site) return fail("No edge controller you can command is connected to this deployment", 503);
  try {
    const response = await fetch(daemonUrl("/edge/driver-decision"), { method: "POST", headers: daemonHeaders(), body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(3000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fail("Edge refused the driver decision", 409);
    await audit({ ...auditActor(a.session!.user), siteId: site.id, organisationId: site.organisationId, action: "DRIVER_LOAD_DECISION", entityType: "edge_hardware", afterData: parsed.data });
    return ok(body);
  } catch {
    return fail("Edge controller unavailable", 503);
  }
}
