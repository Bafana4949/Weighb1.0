import { z } from "zod";
import { UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite } from "@/lib/site-access";
import { staticDeviceCheck } from "@/lib/hardware-catalog";
import { deriveDeviceStatus, ageLabel } from "@/lib/hardware-health";

/**
 * Safe device test. It never commands hardware and never creates transactions:
 * - always: configuration check against the catalogue (adapter implemented? fields complete?)
 * - always: live status from the most recent heartbeat
 * - optionally: a result measured in the browser (Web Serial scale read, NFC bridge read),
 *   which the client performs read-only and submits here to be recorded.
 */
const liveSchema = z.object({
  method: z.enum(["WEB_SERIAL_READ", "NFC_BRIDGE_READ"]),
  passed: z.boolean(),
  detail: z.string().max(300),
  rawSample: z.string().max(200).optional(),
  parsed: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).optional();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const device = await prisma.hardwareDevice.findUnique({ where: { id }, include: { site: { select: { id: true, organisationId: true } } } });
  if (!device || !(await canAccessSite(a.session!.user, device.site))) return fail("Device not found", 404);
  const body = await request.json().catch(() => ({}));
  const live = liveSchema.safeParse(body?.live);
  if (!live.success) return fail("Invalid live test result", 422);

  const check = staticDeviceCheck(device);
  const status = deriveDeviceStatus(device);
  const result = {
    testedAt: new Date().toISOString(),
    configuration: check,
    liveStatus: { status, lastSeen: ageLabel(device.lastSeenAt), message: device.lastMessage },
    live: live.data ?? null,
    physicallyValidated: Boolean(live.data?.passed),
    overall: check.status === "fail" || live.data?.passed === false ? "fail" : check.status === "warn" || !live.data ? "warn" : "pass",
  };
  await prisma.hardwareDevice.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestResult: result as unknown as Prisma.InputJsonValue } });
  await audit({ ...auditActor(a.session!.user), siteId: device.siteId, action: "HARDWARE_TEST", entityType: "hardware_device", entityId: id, afterData: { overall: result.overall, method: live.data?.method ?? "CONFIGURATION_ONLY" } });
  return ok(result);
}
