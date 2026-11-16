import { z } from "zod";
import { HardwareHealth, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { canAccessSite } from "@/lib/site-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordDeviceHealth } from "@/lib/hardware-service";
import { siteIdentifierWhere } from "@/lib/utils";

/**
 * Health reported by the operator console for hardware the browser itself drives
 * (indicator over Web Serial, NFC reader via the local bridge). This is how Manual
 * sites without an edge controller still get honest hardware status. Devices driven by
 * the edge can only be reported by the edge heartbeat.
 */
const schema = z.object({
  reports: z.array(z.object({
    type: z.enum(["SCALE", "NFC_READER"]),
    health: z.nativeEnum(HardwareHealth),
    message: z.string().max(200).optional(),
  })).min(1).max(5),
});

const BROWSER_CONNECTIONS = { SCALE: "WEB_SERIAL", NFC_READER: "NFC_BRIDGE" } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const site = await prisma.site.findFirst({ where: siteIdentifierWhere(id), select: { id: true, organisationId: true } });
  if (!site || !(await canAccessSite(a.session!.user, site))) return fail("Site not found", 404);
  if (!checkRateLimit(`console-hw:${site.id}:${a.session!.user.id}`, 12, 60_000).allowed) return fail("Too many status reports", 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid status report", 422);
  const updated: string[] = [];
  for (const report of parsed.data.reports) {
    const device = await prisma.hardwareDevice.findFirst({
      where: { siteId: site.id, type: report.type, isActive: true, connectionType: BROWSER_CONNECTIONS[report.type] },
      select: { id: true, siteId: true, deviceKey: true, lastHealth: true },
    });
    if (!device) continue;
    await recordDeviceHealth(device, report);
    updated.push(device.deviceKey);
  }
  return ok({ updated });
}
