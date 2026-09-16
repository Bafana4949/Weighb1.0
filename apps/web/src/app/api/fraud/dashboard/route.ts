import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";

export const GET = withScopeErrors(async function GET() {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const callerOrg = a.session!.user.organisationId;
  const scope = userScope(a.session!.user);

  const [vehicles, drivers, incidents, patterns] = await Promise.all([
    prisma.vehicle.findMany({
      where: callerOrg ? { bookings: { some: { site: { organisationId: callerOrg } } } } : {},
      orderBy: { anomalyScore: "desc" },
      take: 20,
    }),
    prisma.driver.findMany({
      where: callerOrg ? { bookings: { some: { site: { organisationId: callerOrg } } } } : {},
      orderBy: { anomalyScore: "desc" },
      take: 20,
      select: { id: true, firstName: true, lastName: true, rfidTag: true, anomalyScore: true, blacklistStatus: true },
    }),
    prisma.incident.findMany({
      where: { type: { in: ["FRAUD_ALERT", "CLONE_DETECTION", "TARE_DRIFT", "ROUTE_DEVIATION"] }, site: scope },
      include: { vehicle: true, driver: true, site: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.incident.groupBy({
      by: ["type"],
      where: { type: { in: ["FRAUD_ALERT", "CLONE_DETECTION", "TARE_DRIFT", "ROUTE_DEVIATION"] }, site: scope },
      _count: true,
      _avg: { anomalyScore: true },
    }),
  ]);

  return ok({ flagged_vehicles: vehicles, flagged_drivers: drivers, recent_incidents: incidents, patterns });
});
