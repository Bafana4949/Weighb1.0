import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { activeWindowWhere } from "@/lib/booking-service";
import { prisma } from "@/lib/prisma";
import { actorCanAccessSite, fail, ok, requireSiteOrRole, withScopeErrors } from "@/lib/api";
import { normalisePlate, siteIdentifierWhere } from "@/lib/utils";

export const GET = withScopeErrors(async function GET(request: NextRequest) {
  const a = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const plate = request.nextUrl.searchParams.get("plate");
  const site = request.nextUrl.searchParams.get("site");
  if (!plate || !site) return fail("plate and site are required", 422);

  const resolvedSite = await prisma.site.findFirst({
    where: siteIdentifierWhere(site),
    include: { config: true },
  });
  if (!resolvedSite) return fail("Site not found", 404);

  if (!(await actorCanAccessSite(a.actor!, resolvedSite))) return fail("Site not found", 404);

  const booking = await prisma.booking.findFirst({
    where: {
      ...activeWindowWhere(new Date(), resolvedSite.config?.journeyWindowGraceMinutes ?? 120),
      vehicle: { plateNormalized: normalisePlate(plate) },
      siteId: resolvedSite.id,
      OR: [
        { orderId: null },
        { order: { status: "ACTIVE" } },
      ],
    },
    include: {
      vehicle: true,
      site: true,
      driver: { select: { rfidTag: true, rfidCredentials: { where: { status: "ACTIVE", credentialType: "DRIVER" }, select: { uid: true }, take: 1 } } },
    },
    orderBy: { windowStart: "asc" },
  });

  if (!booking) return ok(null);

  return ok({
    id: booking.id,
    reference: booking.reference,
    journey_token: booking.journeyToken,
    vehicle_id: booking.vehicleId,
    trailer_id: booking.trailerId,
    driver_id: booking.driverId,
    // Legacy driver tag first, then an issued RFID/NFC credential; null means "no card".
    driver_rfid: booking.driver.rfidTag ?? booking.driver.rfidCredentials[0]?.uid ?? null,
    site_id: booking.site.code,
    plate: booking.vehicle.plate,
    plate_normalized: booking.vehicle.plateNormalized,
    tare_weight_kg: booking.vehicle.tareWeightKg,
    legal_max_gvw_kg: booking.vehicle.legalMaxGvwKg,
    commodity: booking.commodity,
    target_tonnage_kg: booking.targetTonnageKg,
    window_start: booking.windowStart,
    window_end: booking.windowEnd,
  });
});
