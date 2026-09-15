import { BookingStatus,UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBooking } from "@/lib/booking-service";
import { bookingSchema } from "@/lib/validation";
import { fail,ok,requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { assertOrganisationActive } from "@/lib/permissions";
import { parsePagination,siteIdentifierWhere } from "@/lib/utils";
import { routeNotification } from "@/lib/notifications";
import { getOrderFulfilledKg } from "@/lib/order-fulfillment";
export async function GET(request:Request){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const url=new URL(request.url);const {page,limit,skip}=parsePagination(url);const status=url.searchParams.get("status") as BookingStatus|null;const site=url.searchParams.get("site");const from=url.searchParams.get("from");const to=url.searchParams.get("to");const where={...(a.session!.user.role==="TRANSPORTER"?{transporterOrganisationId:a.session!.user.organisationId!}:{site:mineScope(a.session!.user.organisationId)}),...(status?{status}:{}),...(site?{site:siteIdentifierWhere(site)}:{}),...((from||to)?{windowStart:{...(from?{gte:new Date(from)}:{}),...(to?{lte:new Date(to.includes('T')?to:`${to}T23:59:59.999Z`)}:{})}}:{})};const [rows,total]=await Promise.all([prisma.booking.findMany({where,include:{vehicle:true,driver:true,site:true,trailer:true},orderBy:{createdAt:"desc"},skip,take:limit}),prisma.booking.count({where})]);return ok(rows,200,{page,total,limit})}
export async function POST(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN, UserRole.OPERATOR]);
  if (a.error) return a.error;

  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid booking", 422);

  const callerOrgId = a.session!.user.organisationId;
  if (!callerOrgId) return fail("User is not linked to an organisation", 422);

  const callerOrganisation = await prisma.organisation.findUnique({ where: { id: callerOrgId } });
  if (!callerOrganisation) return fail("Organisation not found", 404);

  const orgStatusError = assertOrganisationActive(callerOrganisation);
  if (orgStatusError) return fail(orgStatusError, 403);

  const additionalTrailerIds = [...new Set(parsed.data.additionalTrailerIds ?? [])].filter(
    (id) => id !== parsed.data.trailerId
  );

  const [vehicle, driver, trailer, additionalTrailers, site, order] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } }),
    prisma.driver.findUnique({ where: { id: parsed.data.driverId } }),
    parsed.data.trailerId ? prisma.trailer.findUnique({ where: { id: parsed.data.trailerId } }) : Promise.resolve(null),
    additionalTrailerIds.length
      ? prisma.trailer.findMany({ where: { id: { in: additionalTrailerIds } } })
      : Promise.resolve([]),
    prisma.site.findUnique({ where: { id: parsed.data.siteId } }),
    parsed.data.orderId ? prisma.weighbridgeOrder.findUnique({ where: { id: parsed.data.orderId } }) : Promise.resolve(null),
  ]);

  if (!vehicle || !driver) return fail("Vehicle and driver must be specified", 422);

  if (a.session!.user.role === UserRole.TRANSPORTER && driver.organisationId !== callerOrgId) {
    return fail("Vehicle and driver must belong to your organisation", 403);
  }

  let vehicleWarning: string | null = null;
  if (a.session!.user.role === UserRole.TRANSPORTER && vehicle.organisationId !== callerOrgId) {
    const assignment = await prisma.vehicleTransporterAssignment.findFirst({
      where: { vehicleId: vehicle.id, transporterOrganisationId: callerOrgId, status: "ACTIVE" },
    });
    if (!assignment) return fail("Vehicle must belong to your organisation or have an active subcontractor assignment", 403);
    vehicleWarning = `This vehicle is booked as an authorised ${assignment.relationshipType.toLowerCase().replace(/_/g, " ")}, not owned by your organisation.`;
  }

  if (driver.licenceExpiry < new Date()) {
    return fail(
      `Cannot book ${driver.firstName} ${driver.lastName}: their driver's licence expired on ${driver.licenceExpiry.toLocaleDateString("en-ZA")}. Update the licence in Fleet before booking this driver.`,
      422
    );
  }
  if (driver.blacklistStatus) {
    return fail(`Cannot book ${driver.firstName} ${driver.lastName}: this driver is blacklisted.`, 422);
  }
  if (parsed.data.trailerId && (!trailer || trailer.vehicleId !== vehicle.id)) {
    return fail("Trailer is not linked to the selected vehicle", 422);
  }
  if (
    additionalTrailerIds.length &&
    (additionalTrailers.length !== additionalTrailerIds.length ||
      additionalTrailers.some((t) => t.vehicleId !== vehicle.id))
  ) {
    return fail("All trailers must be linked to the selected vehicle", 422);
  }
  if (!site || !site.isActive) return fail("Destination site is unavailable", 422);
  if (parsed.data.orderId) {
    if (!order || order.status !== "ACTIVE" || order.siteId !== site.id) {
      return fail("Selected order is not active for this site", 422);
    }
    const fulfilledKg = await getOrderFulfilledKg(order.id);
    if (fulfilledKg >= order.estimatedMassKg) {
      await prisma.weighbridgeOrder.update({ where: { id: order.id }, data: { status: "FULFILLED" } });
      return fail(`Cannot book truck: Order ${order.orderNumber} is already fulfilled (${(fulfilledKg / 1000).toFixed(1)} / ${(order.estimatedMassKg / 1000).toFixed(1)} t). Please edit the order to increase the mass quota.`, 422);
    }
  }

  const bookingTransporterOrgId =
    a.session!.user.role === UserRole.TRANSPORTER
      ? callerOrgId
      : vehicle.organisationId;

  const booking = await createBooking({
    ...parsed.data,
    additionalTrailerIds,
    transporterOrganisationId: bookingTransporterOrgId,
    createdById: a.session!.user.id,
  });

  if (booking.status === "APPROVED") {
    await routeNotification({
      event: "BOOKING_APPROVED",
      severity: "LOW",
      subject: `Booking ${booking.reference} approved`,
      body: `Journey token ${booking.journeyToken} is valid for the declared arrival window.`,
      organisationId: bookingTransporterOrgId,
      metadata: { booking_id: booking.id, site_id: booking.site.code },
    });
  } else {
    await routeNotification({
      event: "BOOKING_PENDING_REVIEW",
      severity: "MEDIUM",
      subject: `Booking ${booking.reference} needs approval`,
      body: `${booking.vehicle.plate} · ${booking.driver.firstName} ${booking.driver.lastName} · ${booking.site.name}. Approve it before this truck can use the weighbridge.`,
      organisationId: site.organisationId,
      metadata: { booking_id: booking.id, site_id: booking.site.code },
    });
  }

  return ok({ ...booking, warnings: vehicleWarning ? [vehicleWarning] : [] }, 201);
}

