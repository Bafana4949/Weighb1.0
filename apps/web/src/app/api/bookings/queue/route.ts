import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireSiteOrRole, withScopeErrors } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { siteIdentifierWhere } from "@/lib/utils";

export const GET = withScopeErrors(async function GET(request: NextRequest) {
  const a = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const site = request.nextUrl.searchParams.get("site");
  if (!site) return fail("site is required", 422);
  const resolvedSite = await prisma.site.findFirst({ where: siteIdentifierWhere(site) });
  if (!resolvedSite) return fail("Site not found", 404);

  if (a.actor?.type === "user") {
    const session = await auth();
    if (session?.user && !isPlatformSuperAdmin(session.user) && resolvedSite.organisationId !== session.user.organisationId) {
      return fail("Site not found", 404);
    }
  }

  const queue = await prisma.booking.findMany({
    where: {
      siteId: resolvedSite.id,
      status: { in: ["APPROVED", "ACTIVE"] },
      transactions: {
        none: {
          status: "IN_PROGRESS",
        },
      },
      OR: [
        {
          orderId: { not: null },
          order: { status: "ACTIVE" },
        },
        {
          orderId: null,
          transactions: {
            none: { status: "COMPLETED" },
          },
        },
      ],
    },
    include: {
      vehicle: true,
      driver: true,
      trailer: true,
      transporterOrganisation: true,
      order: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok(
    queue.map((item) => ({
      id: item.id,
      reference: item.reference,
      plate: item.vehicle.plate,
      driver: `${item.driver.firstName} ${item.driver.lastName}`,
      trailer: item.trailer?.trailerId ?? "",
      transporter: item.transporterOrganisation.name,
      commodity: item.commodity,
      orderId: item.orderId,
      orderNumber: item.order?.orderNumber ?? null,
      customerName: item.order?.customerName ?? null,
      stockpile: item.order?.stockpile ?? null,
      status: item.status,
    }))
  );
});
