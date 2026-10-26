import { prisma } from "@/lib/prisma";
import { fail, ok, requireEdge } from "@/lib/api";

/**
 * Configuration the edge controller pulls at start-up and periodically. The edge stays
 * offline-first: its local config file remains authoritative for physical wiring when
 * the cloud is unreachable; this tells it who it is and what the platform expects.
 */
export async function GET(request: Request) {
  const auth = await requireEdge(request);
  if (auth.error) return auth.error;
  const site = await prisma.site.findUnique({
    where: { id: auth.actor!.siteId },
    include: {
      lanes: { where: { isActive: true }, orderBy: { laneNumber: "asc" }, select: { id: true, laneNumber: true, name: true, direction: true } },
      hardwareDevices: { include: { lane: { select: { laneNumber: true } } }, orderBy: { deviceKey: "asc" } },
    },
  });
  if (!site) return fail("Site not found", 404);
  return ok({
    site: { id: site.id, code: site.code, name: site.name, organisationId: site.organisationId, timezone: site.timezone, operatingTier: site.operatingTier },
    lanes: site.lanes,
    devices: site.hardwareDevices.map((d) => ({
      id: d.id,
      deviceKey: d.deviceKey,
      type: d.type,
      name: d.name,
      laneNumber: d.lane?.laneNumber ?? null,
      connectionType: d.connectionType,
      configuration: d.configuration,
      isActive: d.isActive,
      isSimulated: d.isSimulated,
      maintenanceMode: d.maintenanceMode,
    })),
    mqtt: { topicPrefix: `tenant/${site.organisationId}/site/${site.id}` },
  });
}
