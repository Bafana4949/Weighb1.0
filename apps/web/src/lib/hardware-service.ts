import { z } from "zod";
import { HardwareDeviceType, type HardwareHealth, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CONNECTION_TYPES, DEVICE_TYPES, validateDeviceConfiguration, type ConnectionType } from "@/lib/hardware-catalog";
import type { ProfileDevice } from "@/lib/hardware-profiles";

export const deviceInputSchema = z.object({
  type: z.nativeEnum(HardwareDeviceType),
  deviceKey: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/, "Device key: capitals, digits and underscores only"),
  name: z.string().trim().min(2).max(100),
  laneId: z.string().uuid().nullable().optional(),
  connectionType: z.enum(Object.keys(CONNECTION_TYPES) as [ConnectionType, ...ConnectionType[]]),
  manufacturer: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  firmwareVersion: z.string().trim().max(60).nullable().optional(),
  configuration: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  isSimulated: z.boolean().default(false),
  maintenanceMode: z.boolean().default(false),
});
export type DeviceInput = z.infer<typeof deviceInputSchema>;

export type DeviceWriteResult = { ok: true; data: Prisma.HardwareDeviceUncheckedCreateInput } | { ok: false; error: string };

/** Validates a device against the catalogue and the site's lanes; returns Prisma data. */
export async function prepareDevice(siteId: string, input: DeviceInput): Promise<DeviceWriteResult> {
  if (input.laneId) {
    const lane = await prisma.lane.findFirst({ where: { id: input.laneId, siteId }, select: { id: true } });
    if (!lane) return { ok: false, error: "Lane does not belong to this site" };
  }
  const validation = validateDeviceConfiguration(input.type, input.connectionType, input.configuration);
  if (!validation.ok) return { ok: false, error: validation.errors.join("; ") };
  return {
    ok: true,
    data: {
      siteId,
      laneId: input.laneId ?? null,
      type: input.type,
      deviceKey: input.deviceKey,
      name: input.name,
      connectionType: input.connectionType,
      manufacturer: input.manufacturer || null,
      model: input.model || null,
      serialNumber: input.serialNumber || null,
      firmwareVersion: input.firmwareVersion || null,
      configuration: validation.configuration,
      isActive: input.isActive,
      isSimulated: input.isSimulated,
      maintenanceMode: input.maintenanceMode,
    },
  };
}

/**
 * Applies a template to a site: devices are matched by deviceKey; existing devices
 * keep their site-specific settings (addresses, serials) and only missing devices are
 * created. Returns counts for the confirmation message.
 */
export async function applyProfile(siteId: string, devices: ProfileDevice[]): Promise<{ created: number; skipped: number; errors: string[] }> {
  const lanes = await prisma.lane.findMany({ where: { siteId }, select: { id: true, laneNumber: true } });
  const existing = new Set((await prisma.hardwareDevice.findMany({ where: { siteId }, select: { deviceKey: true } })).map((d) => d.deviceKey));
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const device of devices) {
    if (existing.has(device.deviceKey)) { skipped++; continue; }
    const prepared = await prepareDevice(siteId, deviceInputSchema.parse({
      type: device.type,
      deviceKey: device.deviceKey,
      name: device.name,
      laneId: lanes.find((l) => l.laneNumber === device.laneNumber)?.id ?? null,
      connectionType: device.connectionType,
      configuration: device.configuration ?? {},
    }));
    if (!prepared.ok) {
      // Templates leave some fields (host, COM port) for the site; record without them.
      errors.push(`${device.name}: ${prepared.error}`);
      await prisma.hardwareDevice.create({ data: { siteId, laneId: lanes.find((l) => l.laneNumber === device.laneNumber)?.id ?? null, type: device.type, deviceKey: device.deviceKey, name: device.name, connectionType: device.connectionType, configuration: device.configuration ?? {} } });
    } else {
      await prisma.hardwareDevice.create({ data: prepared.data });
    }
    created++;
  }
  return { created, skipped, errors };
}

/** Records a health report: latest state on the device, history row only on change. */
export async function recordDeviceHealth(
  device: { id: string; siteId: string; lastHealth: HardwareHealth | null },
  report: { health: HardwareHealth; message?: string | null; readings?: unknown },
  at: Date = new Date(),
) {
  await prisma.hardwareDevice.update({
    where: { id: device.id },
    data: { lastHealth: report.health, lastSeenAt: at, lastMessage: report.message ?? null },
  });
  if (device.lastHealth !== report.health) {
    await prisma.hardwareStatus.create({
      data: {
        siteId: device.siteId,
        deviceId: device.id,
        health: report.health,
        lastSeen: at,
        message: report.message ?? null,
        sensorReadings: (report.readings ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

export function deviceTypeLabel(type: HardwareDeviceType): string {
  return DEVICE_TYPES[type].label;
}
