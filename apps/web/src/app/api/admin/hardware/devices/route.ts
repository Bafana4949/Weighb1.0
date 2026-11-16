import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite } from "@/lib/site-access";
import { deviceInputSchema, prepareDevice } from "@/lib/hardware-service";
import { deriveDeviceStatus } from "@/lib/hardware-health";

/** Devices of one site. Company and site admins may read; only the platform configures. */
export async function GET(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const siteId = new URL(request.url).searchParams.get("siteId");
  if (!siteId) return fail("siteId is required", 422);
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, organisationId: true } });
  if (!site || !(await canAccessSite(a.session!.user, site))) return fail("Site not found", 404);
  const devices = await prisma.hardwareDevice.findMany({
    where: { siteId },
    include: { lane: { select: { id: true, laneNumber: true, name: true } } },
    orderBy: [{ type: "asc" }, { deviceKey: "asc" }],
  });
  const now = new Date();
  return ok(devices.map((d) => ({ ...d, status: deriveDeviceStatus(d, now) })));
}

export async function POST(request: Request) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === "string" ? body.siteId : null;
  const parsed = deviceInputSchema.safeParse(body);
  if (!siteId || !parsed.success) return fail(parsed.success ? "siteId is required" : parsed.error.issues[0]?.message ?? "Invalid device", 422);
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return fail("Site not found", 404);
  if (await prisma.hardwareDevice.findUnique({ where: { siteId_deviceKey: { siteId, deviceKey: parsed.data.deviceKey } } })) {
    return fail(`Device key ${parsed.data.deviceKey} is already used at this site`, 409);
  }
  const prepared = await prepareDevice(siteId, parsed.data);
  if (!prepared.ok) return fail(prepared.error, 422);
  const device = await prisma.hardwareDevice.create({ data: prepared.data });
  await audit({ ...auditActor(a.session!.user), siteId, action: "HARDWARE_DEVICE_CREATED", entityType: "hardware_device", entityId: device.id, afterData: prepared.data });
  return ok(device, 201);
}
