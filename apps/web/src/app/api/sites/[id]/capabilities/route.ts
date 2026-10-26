import { UserRole, HardwareDeviceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { canAccessSite } from "@/lib/site-access";
import { siteIdentifierWhere } from "@/lib/utils";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { resolveSiteCapabilities } from "@/lib/tiers";

/**
 * What the operator console at this site can do. Hardware flags keep their original
 * shape for the console; tier fields tell it how to treat typed weights and cards.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimitOrFail(request, "sites-capabilities", 60, 60 * 1000);
  if (limited) return limited;
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const { id } = await params;
  const site = await prisma.site.findFirst({
    where: siteIdentifierWhere(id),
    include: {
      organisation: { select: { licensedTier: true } },
      config: { select: { allowedWorkflows: true } },
      hardwareDevices: { select: { id: true, type: true, name: true, deviceKey: true, isActive: true, maintenanceMode: true, connectionType: true, configuration: true } },
    },
  });
  if (!site || !(await canAccessSite(a.session!.user, site))) return fail("Site not found", 404);

  const active = site.hardwareDevices.filter((d) => d.isActive);
  const scale = active.find((d) => d.type === HardwareDeviceType.SCALE);
  const scaleConfig = (scale?.configuration as Record<string, unknown> | null) ?? {};
  const resolved = resolveSiteCapabilities({ tier: site.operatingTier, licensedTier: site.organisation.licensedTier, devices: site.hardwareDevices, overrides: site.featureOverrides });

  return ok({
    siteId: site.id,
    hasScale: Boolean(scale),
    scaleProtocol: typeof scaleConfig.protocol === "string" ? scaleConfig.protocol : "METTLER_TOLEDO_CONTINUOUS",
    scaleConnection: scale?.connectionType ?? null,
    scaleBaud: Number(scaleConfig.baudRate) || null,
    scaleFraming: scaleConfig.dataBits && scaleConfig.parity ? `${scaleConfig.dataBits}-${scaleConfig.parity}` : null,
    hasAnpr: active.some((d) => d.type === HardwareDeviceType.ANPR_CAMERA),
    hasGates: active.some((d) => d.type === HardwareDeviceType.ENTRY_GATE || d.type === HardwareDeviceType.EXIT_GATE),
    hasTrafficLights: active.some((d) => d.type === HardwareDeviceType.TRAFFIC_LIGHT),
    hasPositionSensors: active.some((d) => d.type === HardwareDeviceType.POSITION_SENSOR),
    hasCardReader: active.some((d) => d.type === HardwareDeviceType.RFID_READER || d.type === HardwareDeviceType.NFC_READER),
    activeDevices: active.map((d) => ({ id: d.id, type: d.type, name: d.name, deviceKey: d.deviceKey, isActive: d.isActive })),
    operatingTier: resolved.effectiveTier,
    manualEntryPolicy: resolved.manualEntryPolicy,
    requireCardIdentification: resolved.requireCardIdentification,
    allowedWorkflows: site.config?.allowedWorkflows ?? ["DISPATCH", "RECEIPT", "KNOWN_TARE"],
  });
}

/** Replaced by the catalogue-driven hardware centre (/admin/hardware). */
export async function POST() {
  return fail("Hardware is now configured in the hardware centre (/admin/hardware) via /api/admin/hardware/devices", 410);
}
