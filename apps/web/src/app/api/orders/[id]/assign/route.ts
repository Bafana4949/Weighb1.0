import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite } from "@/lib/site-access";
import { transporterServesCompany } from "@/lib/transporter-links";
import { createBooking } from "@/lib/booking-service";
import { getOrderFulfilledKg } from "@/lib/order-fulfillment";

const assignSchema = z.object({
  organisationId: z.string().uuid(),
  bookings: z.array(z.object({
    vehicleId: z.string().uuid(),
    driverId: z.string().uuid(),
    trailer1Id: z.string().uuid().optional(),
    trailer2Id: z.string().uuid().optional(),
  })).min(1),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export const POST = withScopeErrors(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([UserRole.ADMIN]);
  if (auth.error) return auth.error;

  const { id } = await context.params;

  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid assignment payload", 422);

  const order = await prisma.weighbridgeOrder.findUnique({
    where: { id },
    include: { site: true, productRef: true }
  });

  if (!order) return fail("Order not found", 404);

  if (!(await canAccessSite(auth.session!.user, order.site))) return fail("Order not found", 404);
  const transporterId = parsed.data.organisationId;
  if (!(await transporterServesCompany(transporterId, order.site.organisationId))) {
    return fail("Transporter is not contracted to this company", 403);
  }

  if (order.status !== "ACTIVE") {
    return fail(`Cannot assign trucks to order with status '${order.status}'. Please edit the order to increase the estimated mass if you wish to assign more trucks.`, 422);
  }

  const fulfilledKg = await getOrderFulfilledKg(order.id);
  if (fulfilledKg >= order.estimatedMassKg) {
    await prisma.weighbridgeOrder.update({
      where: { id: order.id },
      data: { status: "FULFILLED" },
    });
    return fail(`Order ${order.orderNumber} is already fulfilled (${(fulfilledKg / 1000).toFixed(1)} / ${(order.estimatedMassKg / 1000).toFixed(1)} t). Please edit the order to increase the estimated mass before assigning more trucks.`, 422);
  }

  const [vehicles, drivers, trailers, assignments] = await Promise.all([
    prisma.vehicle.findMany({ where: { id: { in: parsed.data.bookings.map((b) => b.vehicleId) }, deletedAt: null } }),
    prisma.driver.findMany({ where: { id: { in: parsed.data.bookings.map((b) => b.driverId) }, deletedAt: null } }),
    prisma.trailer.findMany({ where: { id: { in: parsed.data.bookings.flatMap((b) => [b.trailer1Id, b.trailer2Id]).filter((t): t is string => Boolean(t)) } } }),
    prisma.vehicleTransporterAssignment.findMany({ where: { vehicleId: { in: parsed.data.bookings.map((b) => b.vehicleId) }, transporterOrganisationId: transporterId, status: "ACTIVE" } }),
  ]);
  const now = new Date();

  let created = 0;
  const errors: string[] = [];

  for (const bookingDef of parsed.data.bookings) {
    try {
      const vehicle = vehicles.find(v => v.id === bookingDef.vehicleId);
      const driver = drivers.find((d) => d.id === bookingDef.driverId);
      if (!vehicle) throw new Error("Vehicle not found");
      if (!driver || driver.organisationId !== transporterId) throw new Error(`Driver is not employed by the selected transporter`);
      if (vehicle.organisationId !== transporterId && !assignments.some((x) => x.vehicleId === vehicle.id)) {
        throw new Error(`${vehicle.plate} is not owned by or assigned to the selected transporter`);
      }
      for (const trailerId of [bookingDef.trailer1Id, bookingDef.trailer2Id]) {
        if (trailerId && trailers.find((t) => t.id === trailerId)?.vehicleId !== vehicle.id) throw new Error(`Trailer is not linked to ${vehicle.plate}`);
      }
      // Direct assignment skips the approval queue, never the safety policy.
      if (driver.blacklistStatus) throw new Error(`${driver.firstName} ${driver.lastName} is blacklisted`);
      if (driver.licenceExpiry < now) throw new Error(`${driver.firstName} ${driver.lastName}'s licence has expired`);
      if (vehicle.status !== "ACTIVE") throw new Error(`${vehicle.plate} is ${vehicle.status.toLowerCase().replace(/_/g, " ")}`);
      if (vehicle.insuranceExpiry < now) throw new Error(`${vehicle.plate}'s insurance has expired`);

      // Calculate target tonnage
      const maxPayload = (vehicle.legalMaxGvwKg ?? 50000) - (vehicle.tareWeightKg ?? 15000);
      const targetTonnageKg = Math.min(order.estimatedMassKg, maxPayload > 0 ? maxPayload : 30000);

      const additionalTrailers = bookingDef.trailer2Id ? [bookingDef.trailer2Id] : [];

      const booking = await createBooking({
        siteId: order.siteId,
        vehicleId: bookingDef.vehicleId,
        driverId: bookingDef.driverId,
        targetTonnageKg,
        commodity: order.productRef?.name ?? order.product,
        windowStart: new Date(parsed.data.windowStart),
        windowEnd: new Date(parsed.data.windowEnd),
        trailerId: bookingDef.trailer1Id ?? undefined,
        additionalTrailerIds: additionalTrailers.length ? additionalTrailers : undefined,
        orderId: order.id,
        transporterOrganisationId: transporterId,
        createdById: auth.session!.user.id
      });
      
      // Auto-approve bookings that are directly assigned by the client/admin
      await prisma.booking.update({
        where: { id: booking.id },
        data: { 
          status: "APPROVED", 
          approvedAt: new Date(), 
          approvalReason: "Assigned directly from Order by Client" 
        }
      });
      
      created++;
      await audit({ ...auditActor(auth.session!.user), siteId: order.siteId, action: "ORDER_TRUCK_ASSIGNED", entityType: "booking", entityId: booking.id, afterData: { orderId: order.id, vehicleId: vehicle.id, driverId: driver.id, transporterId } });
    } catch (e: any) {
      errors.push(`Failed to assign truck: ${e.message || String(e)}`);
    }
  }

  return ok({ created, errors });
});
