import { UserRole } from "@prisma/client";
import { z } from "zod";
import { fail, ok, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { daemonHeaders, daemonSiteFor, daemonUrl } from "@/lib/edge-proxy";

// Manual gate and light commands are overrides of the automatic flow, so every one
// carries a reason and lands in the audit trail. The edge controller still applies
// its own safety interlocks (beams, lane state) before moving anything.
const schema = z.object({
  action: z.enum(["GATE_OPEN", "GATE_CLOSE", "LIGHT", "BUZZER"]),
  target: z.enum(["ENTRY", "EXIT"]).optional(),
  value: z.enum(["RED", "GREEN", "ON", "OFF"]).optional(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
  lane: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid hardware command", 422);
  const site = await daemonSiteFor(a.session!.user);
  if (!site) return fail("No edge controller you can command is connected to this deployment", 503);
  try {
    const response = await fetch(daemonUrl("/edge/command"), { method: "POST", headers: daemonHeaders(), body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(3000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return fail(typeof body.detail === "string" ? `Edge refused the command: ${body.detail}` : "Edge refused the command", 409);
    await audit({ ...auditActor(a.session!.user), siteId: site.id, organisationId: site.organisationId, action: "HARDWARE_COMMAND", entityType: "edge_hardware", reason: parsed.data.reason, afterData: parsed.data });
    return ok(body);
  } catch {
    return fail("Edge controller unavailable", 503);
  }
}
