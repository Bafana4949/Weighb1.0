import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { deviceInputSchema, prepareDevice } from "@/lib/hardware-service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const before = await prisma.hardwareDevice.findUnique({ where: { id } });
  if (!before) return fail("Device not found", 404);
  const parsed = deviceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid device", 422);
  if (parsed.data.deviceKey !== before.deviceKey) {
    const clash = await prisma.hardwareDevice.findUnique({ where: { siteId_deviceKey: { siteId: before.siteId, deviceKey: parsed.data.deviceKey } } });
    if (clash) return fail(`Device key ${parsed.data.deviceKey} is already used at this site`, 409);
  }
  const prepared = await prepareDevice(before.siteId, parsed.data);
  if (!prepared.ok) return fail(prepared.error, 422);
  const { siteId: _site, ...data } = prepared.data;
  const device = await prisma.hardwareDevice.update({ where: { id }, data });
  await audit({
    ...auditActor(a.session!.user),
    siteId: before.siteId,
    action: before.type === "SCALE" ? "SCALE_CONFIGURATION_UPDATED" : "HARDWARE_DEVICE_UPDATED",
    entityType: "hardware_device",
    entityId: id,
    beforeData: { name: before.name, connectionType: before.connectionType, configuration: before.configuration, isActive: before.isActive, isSimulated: before.isSimulated, maintenanceMode: before.maintenanceMode },
    afterData: { name: device.name, connectionType: device.connectionType, configuration: device.configuration, isActive: device.isActive, isSimulated: device.isSimulated, maintenanceMode: device.maintenanceMode },
  });
  return ok(device);
}

/** Devices with history are retired (kept for audit); never-used rows are removed. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const device = await prisma.hardwareDevice.findUnique({ where: { id }, include: { _count: { select: { statuses: true, calibrationCertificates: true } } } });
  if (!device) return fail("Device not found", 404);
  const hasHistory = device._count.statuses > 0 || device._count.calibrationCertificates > 0;
  if (hasHistory) await prisma.hardwareDevice.update({ where: { id }, data: { isActive: false } });
  else await prisma.hardwareDevice.delete({ where: { id } });
  await audit({ ...auditActor(a.session!.user), siteId: device.siteId, action: hasHistory ? "HARDWARE_DEVICE_RETIRED" : "HARDWARE_DEVICE_DELETED", entityType: "hardware_device", entityId: id, beforeData: { deviceKey: device.deviceKey, type: device.type } });
  return ok({ id, retired: hasHistory, deleted: !hasHistory });
}
