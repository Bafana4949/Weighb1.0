import { UserRole, HardwareDeviceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { siteIdentifierWhere } from "@/lib/utils";
import { rateLimitOrFail } from "@/lib/rate-limit";

export type SiteCapabilities = {
  siteId: string;
  hasScale: boolean;
  scaleProtocol: string;
  hasAnpr: boolean;
  hasGates: boolean;
  hasTrafficLights: boolean;
  hasPositionSensors: boolean;
  activeDevices: Array<{
    id: string;
    type: HardwareDeviceType;
    name: string;
    deviceKey: string;
    isActive: boolean;
  }>;
};

// GET: Return computed capabilities for a site
export const GET = withScopeErrors(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimitOrFail(request, "sites-capabilities", 60, 60 * 1000);
  if (limited) return limited;

  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const { id } = await params;
  const site = await prisma.site.findFirst({
    where: {
      ...siteIdentifierWhere(id),
      ...userScope(a.session!.user),
    },
    include: {
      hardwareDevices: {
        where: { isActive: true },
        select: {
          id: true,
          type: true,
          name: true,
          deviceKey: true,
          isActive: true,
          configuration: true,
        },
      },
    },
  });

  if (!site) return fail("Site not found", 404);

  const scaleDevice = site.hardwareDevices.find((d) => d.type === HardwareDeviceType.SCALE);
  const scaleConfig = (scaleDevice?.configuration as Record<string, any>) || {};

  const capabilities: SiteCapabilities = {
    siteId: site.id,
    hasScale: !!scaleDevice,
    scaleProtocol: scaleConfig.protocol || "METTLER_TOLEDO_CONTINUOUS",
    hasAnpr: site.hardwareDevices.some((d) => d.type === HardwareDeviceType.ANPR_CAMERA),
    hasGates: site.hardwareDevices.some(
      (d) => d.type === HardwareDeviceType.ENTRY_GATE || d.type === HardwareDeviceType.EXIT_GATE
    ),
    hasTrafficLights: site.hardwareDevices.some((d) => d.type === HardwareDeviceType.TRAFFIC_LIGHT),
    hasPositionSensors: site.hardwareDevices.some((d) => d.type === HardwareDeviceType.POSITION_SENSOR),
    activeDevices: site.hardwareDevices.map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      deviceKey: d.deviceKey,
      isActive: d.isActive,
    })),
  };

  return ok(capabilities);
});

// POST / PUT: Update site hardware capabilities atomically
export const POST = withScopeErrors(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const { id } = await params;
  const body = await request.json();

  const {
    hasScale = true,
    scaleProtocol = "METTLER_TOLEDO_CONTINUOUS",
    hasAnpr = false,
    hasGates = false,
    hasTrafficLights = false,
    hasPositionSensors = false,
  } = body;

  const site = await prisma.site.findFirst({
    where: {
      ...siteIdentifierWhere(id),
      ...userScope(a.session!.user),
    },
  });

  if (!site) return fail("Site not found", 404);

  // Execute hardware device reconciliation in a single atomic transaction
  await prisma.$transaction(async (tx) => {
    // 1. SCALE INDICATOR
    if (hasScale) {
      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "SCALE_PRIMARY" } },
        update: {
          name: "Main Digital Weighbridge Indicator",
          type: HardwareDeviceType.SCALE,
          isActive: true,
          configuration: {
            protocol: scaleProtocol,
            unit: "kg",
            baudRate: 9600,
            dataBits: scaleProtocol.includes("7") ? 7 : 8,
            parity: scaleProtocol.includes("EVEN") ? "even" : "none",
            stopBits: 1,
            continuous: true,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "SCALE_PRIMARY",
          name: "Main Digital Weighbridge Indicator",
          type: HardwareDeviceType.SCALE,
          isActive: true,
          configuration: {
            protocol: scaleProtocol,
            unit: "kg",
            baudRate: 9600,
            dataBits: 8,
            parity: "none",
            stopBits: 1,
            continuous: true,
          },
        },
      });
    } else {
      await tx.hardwareDevice.updateMany({
        where: { siteId: site.id, type: HardwareDeviceType.SCALE },
        data: { isActive: false },
      });
    }

    // 2. ANPR CAMERA
    if (hasAnpr) {
      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "ANPR_CAMERA_MAIN" } },
        update: {
          name: "Automated Number Plate Recognition (ANPR)",
          type: HardwareDeviceType.ANPR_CAMERA,
          isActive: true,
          configuration: {
            brand: "GENERIC_ANPR",
            triggerEvent: "ON_SCALE_STABLE",
            captureFront: true,
            captureRear: true,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "ANPR_CAMERA_MAIN",
          name: "Automated Number Plate Recognition (ANPR)",
          type: HardwareDeviceType.ANPR_CAMERA,
          isActive: true,
          configuration: {
            brand: "GENERIC_ANPR",
            triggerEvent: "ON_SCALE_STABLE",
            captureFront: true,
            captureRear: true,
          },
        },
      });
    } else {
      await tx.hardwareDevice.updateMany({
        where: { siteId: site.id, type: HardwareDeviceType.ANPR_CAMERA },
        data: { isActive: false },
      });
    }

    // 3. BOOM GATES (Entry and Exit Relays)
    if (hasGates) {
      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "GATE_ENTRY" } },
        update: {
          name: "Inbound Entry Boom Barrier",
          type: HardwareDeviceType.ENTRY_GATE,
          isActive: true,
          configuration: {
            relayController: "MODBUS_TCP",
            pulseDurationMs: 1500,
            autoCloseDelaySeconds: 8,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "GATE_ENTRY",
          name: "Inbound Entry Boom Barrier",
          type: HardwareDeviceType.ENTRY_GATE,
          isActive: true,
          configuration: {
            relayController: "MODBUS_TCP",
            pulseDurationMs: 1500,
            autoCloseDelaySeconds: 8,
          },
        },
      });

      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "GATE_EXIT" } },
        update: {
          name: "Outbound Exit Boom Barrier",
          type: HardwareDeviceType.EXIT_GATE,
          isActive: true,
          configuration: {
            relayController: "MODBUS_TCP",
            pulseDurationMs: 1500,
            autoCloseDelaySeconds: 8,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "GATE_EXIT",
          name: "Outbound Exit Boom Barrier",
          type: HardwareDeviceType.EXIT_GATE,
          isActive: true,
          configuration: {
            relayController: "MODBUS_TCP",
            pulseDurationMs: 1500,
            autoCloseDelaySeconds: 8,
          },
        },
      });
    } else {
      await tx.hardwareDevice.updateMany({
        where: {
          siteId: site.id,
          type: { in: [HardwareDeviceType.ENTRY_GATE, HardwareDeviceType.EXIT_GATE] },
        },
        data: { isActive: false },
      });
    }

    // 4. TRAFFIC LIGHTS
    if (hasTrafficLights) {
      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "TRAFFIC_LIGHT_MAIN" } },
        update: {
          name: "Deck Directional Traffic Signal",
          type: HardwareDeviceType.TRAFFIC_LIGHT,
          isActive: true,
          configuration: {
            defaultState: "RED",
            greenDurationSeconds: 15,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "TRAFFIC_LIGHT_MAIN",
          name: "Deck Directional Traffic Signal",
          type: HardwareDeviceType.TRAFFIC_LIGHT,
          isActive: true,
          configuration: {
            defaultState: "RED",
            greenDurationSeconds: 15,
          },
        },
      });
    } else {
      await tx.hardwareDevice.updateMany({
        where: { siteId: site.id, type: HardwareDeviceType.TRAFFIC_LIGHT },
        data: { isActive: false },
      });
    }

    // 5. POSITION SENSORS (Anti-Cheating Straddle Beams)
    if (hasPositionSensors) {
      await tx.hardwareDevice.upsert({
        where: { siteId_deviceKey: { siteId: site.id, deviceKey: "POSITION_SENSOR_MAIN" } },
        update: {
          name: "Optical Deck Positioning Beams",
          type: HardwareDeviceType.POSITION_SENSOR,
          isActive: true,
          configuration: {
            interlockStrict: true,
            holdSeconds: 2,
          },
        },
        create: {
          siteId: site.id,
          deviceKey: "POSITION_SENSOR_MAIN",
          name: "Optical Deck Positioning Beams",
          type: HardwareDeviceType.POSITION_SENSOR,
          isActive: true,
          configuration: {
            interlockStrict: true,
            holdSeconds: 2,
          },
        },
      });
    } else {
      await tx.hardwareDevice.updateMany({
        where: { siteId: site.id, type: HardwareDeviceType.POSITION_SENSOR },
        data: { isActive: false },
      });
    }
  });

  return ok({
    success: true,
    siteId: site.id,
    message: "Site hardware capabilities successfully updated.",
    capabilities: {
      hasScale,
      scaleProtocol,
      hasAnpr,
      hasGates,
      hasTrafficLights,
      hasPositionSensors,
    },
  });
});
