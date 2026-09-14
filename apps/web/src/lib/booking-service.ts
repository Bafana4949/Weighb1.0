import { randomBytes } from "node:crypto";
import { BookingStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface BookingPolicyResult { approved: boolean; reasons: string[] }

export async function evaluateBookingPolicy(input: {
  vehicleId: string;
  driverId: string;
  targetTonnageKg: number;
  siteId: string;
}): Promise<BookingPolicyResult> {
  const [vehicle, driver, config] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: input.vehicleId } }),
    prisma.driver.findUnique({ where: { id: input.driverId } }),
    prisma.siteConfig.findUnique({ where: { siteId: input.siteId } }),
  ]);
  const reasons: string[] = [];
  if (!vehicle || vehicle.deletedAt || vehicle.status !== "ACTIVE") reasons.push("Vehicle is not active");
  if (!driver || driver.deletedAt) reasons.push("Driver is not active");
  if (driver?.blacklistStatus) reasons.push("Driver is blacklisted");
  if (vehicle && config?.requireInsuranceValid && vehicle.insuranceExpiry < new Date()) reasons.push("Vehicle insurance has expired");
  if (driver && config?.requireDriverLicenceValid && driver.licenceExpiry < new Date()) reasons.push("Driver licence has expired");
  // Note: Actual tare weight is captured live on the scale by the weighbridge operator for each trip.
  if (vehicle && vehicle.legalMaxGvwKg > 0 && input.targetTonnageKg > vehicle.legalMaxGvwKg) reasons.push("Target load exceeds legal gross vehicle weight");
  if (config && input.targetTonnageKg > config.maxCapacityKg) reasons.push("Expected load exceeds site weighbridge capacity");
  return { approved: reasons.length === 0, reasons };
}

export function bookingReference(): string {
  return `ORDER-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function journeyToken(): string {
  return `JT-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function createBooking(input: {
  transporterOrganisationId: string;
  createdById: string;
  vehicleId: string;
  trailerId?: string | null;
  additionalTrailerIds?: string[];
  driverId: string;
  siteId: string;
  orderId?: string | null;
  commodity: string;
  commodityDescription?: string | null;
  targetTonnageKg: number;
  windowStart: Date;
  windowEnd: Date;
}) {
  const { additionalTrailerIds, ...bookingInput } = input;
  const policy = await evaluateBookingPolicy(input);
  const config = await prisma.siteConfig.findUnique({ where: { siteId: input.siteId } });
  const autoApprove = Boolean(config?.autoApprovalEnabled && policy.approved);
  return prisma.booking.create({
    data: {
      ...bookingInput,
      reference: bookingReference(),
      journeyToken: journeyToken(),
      status: autoApprove ? BookingStatus.APPROVED : BookingStatus.PENDING,
      approvedAt: autoApprove ? new Date() : null,
      approvalReason: autoApprove ? "Auto-approved: all configured compliance checks passed" : policy.reasons.join("; ") || null,
      ...(additionalTrailerIds?.length ? { additionalTrailers: { create: additionalTrailerIds.map((trailerId, i) => ({ trailerId, position: i + 2 })) } } : {}),
    },
    include: { vehicle: true, driver: true, site: true, trailer: true, order: true, additionalTrailers: { include: { trailer: true } } },
  });
}

export function activeWindowWhere(now = new Date(), graceMinutes = 120): Prisma.BookingWhereInput {
  const grace = graceMinutes * 60 * 1000;
  return {
    status: { in: [BookingStatus.APPROVED, BookingStatus.ACTIVE] },
    windowStart: { lte: new Date(now.getTime() + grace) },
    windowEnd: { gte: new Date(now.getTime() - grace) },
  };
}
