import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Calculates total fulfilled kilograms for an order from completed weighbridge transactions.
 */
export async function getOrderFulfilledKg(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const db = tx ?? prisma;
  const bookings = await db.booking.findMany({
    where: { orderId },
    include: {
      transactions: {
        where: { status: "COMPLETED" },
        select: { netWeightKg: true },
      },
    },
  });

  return bookings.reduce(
    (sum, b) => sum + b.transactions.reduce((s, t) => s + t.netWeightKg, 0),
    0
  );
}

/**
 * Checks whether an order should transition between ACTIVE and FULFILLED,
 * updates the database accordingly, and cancels queued bookings if fulfilled.
 */
export async function syncOrderFulfillmentStatus(
  orderId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const order = await db.weighbridgeOrder.findUnique({
    where: { id: orderId },
  });
  if (!order || order.status === "CANCELLED" || order.status === "DRAFT") {
    return order;
  }

  const fulfilledKg = await getOrderFulfilledKg(orderId, db);
  const isFulfilled = fulfilledKg >= order.estimatedMassKg;

  if (isFulfilled && order.status === "ACTIVE") {
    const updated = await db.weighbridgeOrder.update({
      where: { id: orderId },
      data: { status: "FULFILLED" },
    });
    // Auto-cancel remaining unweighed queued trucks
    await db.booking.updateMany({
      where: {
        orderId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      data: {
        status: "CANCELLED",
        rejectionReason: "Order quota fulfilled",
      },
    });
    return updated;
  } else if (!isFulfilled && order.status === "FULFILLED") {
    // Reopen to ACTIVE if user added more estimated mass
    const updated = await db.weighbridgeOrder.update({
      where: { id: orderId },
      data: { status: "ACTIVE" },
    });
    return updated;
  }

  return order;
}
