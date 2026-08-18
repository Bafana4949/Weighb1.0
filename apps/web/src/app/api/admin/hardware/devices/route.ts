import { z } from "zod";
import { HardwareDeviceType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const deviceSchema = z.object({
  siteId: z.string().uuid(),
  laneId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(100),
  deviceKey: z.string().min(2).max(100),
  type: z.nativeEnum(HardwareDeviceType),
  serialNumber: z.string().max(100).optional().nullable(),
  firmwareVersion: z.string().max(100).optional().nullable(),
});

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  
  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid device data", 422);

  // Tenant isolation check: get the site to verify organisation ownership
  const site = await prisma.site.findUnique({ where: { id: parsed.data.siteId } });
  if (!site) return fail("Invalid site selected", 400);

  if (!isSuperAdmin) {
    if (site.organisationId !== a.session!.user.organisationId) {
      return fail("You can only create devices for your own organisation's sites", 403);
    }
  }

  // Check if device key already exists for this site
  const existing = await prisma.hardwareDevice.findUnique({
    where: { siteId_deviceKey: { siteId: parsed.data.siteId, deviceKey: parsed.data.deviceKey } }
  });
  if (existing) return fail("A device with this key already exists at this site", 400);

  try {
    const device = await prisma.hardwareDevice.create({
      data: {
        siteId: parsed.data.siteId,
        laneId: parsed.data.laneId || null,
        name: parsed.data.name,
        deviceKey: parsed.data.deviceKey,
        type: parsed.data.type,
        serialNumber: parsed.data.serialNumber || null,
        firmwareVersion: parsed.data.firmwareVersion || null,
      },
      include: {
        site: { select: { name: true, organisation: { select: { name: true } } } },
        lane: { select: { name: true } }
      }
    });

    await audit({
      userId: a.session!.user.id,
      action: "HARDWARE_DEVICE_CREATED",
      entityType: "hardware_device",
      entityId: device.id,
      afterData: { ...parsed.data },
    });

    return ok(device, 201);
  } catch (error) {
    console.error("Device creation error:", error);
    return fail("An error occurred while creating the device", 500);
  }
}
