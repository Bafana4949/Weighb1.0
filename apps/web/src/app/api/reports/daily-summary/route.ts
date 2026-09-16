import { UserRole } from "@prisma/client";
import { startOfDay, endOfDay } from "date-fns";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope, transporterScope } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { transactionStats } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { siteIdentifierWhere } from "@/lib/utils";

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.TRANSPORTER]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ? new Date(url.searchParams.get("date")!) : new Date();
  const site = url.searchParams.get("site");

  const isSuper = isPlatformSuperAdmin(a.session!.user);
  const isTransporter = a.session!.user.role === "TRANSPORTER";

  const siteScope = isSuper || isTransporter ? {} : userScope(a.session!.user);
  const extraTxWhere = isTransporter ? transporterScope(a.session!.user) : {};

  const stats = await transactionStats({ gte: startOfDay(date), lte: endOfDay(date) }, site, siteScope, extraTxWhere);

  const incidentWhere = isSuper
    ? { createdAt: { gte: startOfDay(date), lte: endOfDay(date) }, ...(site ? { site: siteIdentifierWhere(site) } : {}) }
    : isTransporter
      ? {
          createdAt: { gte: startOfDay(date), lte: endOfDay(date) },
          OR: [
            { booking: { transporterOrganisationId: a.session!.user.organisationId! } },
            { vehicle: { organisationId: a.session!.user.organisationId! } },
          ],
          ...(site ? { site: siteIdentifierWhere(site) } : {}),
        }
      : {
          createdAt: { gte: startOfDay(date), lte: endOfDay(date) },
          site: { ...siteScope, ...(site ? siteIdentifierWhere(site) : {}) },
        };

  const incidents = await prisma.incident.groupBy({
    by: ["severity"],
    where: incidentWhere,
    _count: true,
  });

  return ok({ ...stats, incidents });
});
