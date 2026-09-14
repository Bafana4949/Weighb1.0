import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { createBooking } from "@/lib/booking-service";

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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([UserRole.ADMIN]);
  if (auth.error) return auth.error;

  const { id } = await context.params;

  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid assignment payload", 422);

  const order = await prisma.weighbridgeOrder.findUnique({
    where: { id },
    include: { productRef: true }
  });

  if (!order) return fail("Order not found", 404);

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: parsed.data.bookings.map(b => b.vehicleId) } }
  });

  let created = 0;
  const errors: string[] = [];

  for (const bookingDef of parsed.data.bookings) {
    try {
      const vehicle = vehicles.find(v => v.id === bookingDef.vehicleId);
      if (!vehicle) throw new Error("Vehicle not found");

      // Calculate target tonnage. Simplified: Use order's estimated or vehicle's legal max minus tare.
      const maxPayload = (vehicle.legalMaxGvwKg ?? 50000) - (vehicle.tareWeightKg ?? 15000);
      const targetTonnageKg = Math.min(order.estimatedMassKg, maxPayload > 0 ? maxPayload : 30000);

      const additionalTrailers = bookingDef.trailer2Id ? [bookingDef.trailer2Id] : [];

      const booking = await createBooking({
        siteId: order.siteId,
        vehicleId: bookingDef.vehicleId,
        driverId: bookingDef.driverId,
        targetTonnageKg,
        commodity: (order.product && order.product.toUpperCase() !== "UNKNOWN" ? order.product : null)
          || order.productRef?.name
          || "High-Grade Export Coal (RB1 6000 kcal/kg)",
        windowStart: new Date(parsed.data.windowStart),
        windowEnd: new Date(parsed.data.windowEnd),
        trailerId: bookingDef.trailer1Id ?? undefined,
        additionalTrailerIds: additionalTrailers.length ? additionalTrailers : undefined,
        orderId: order.id,
        transporterOrganisationId: parsed.data.organisationId,
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
    } catch (e: any) {
      errors.push(`Failed to assign truck: ${e.message || String(e)}`);
    }
  }

  return ok({ created, errors });
}
