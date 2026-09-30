import { createHash } from "crypto";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { syncOrderFulfillmentStatus } from "@/lib/order-fulfillment";
import { computeIntegrityHash, getChainHead } from "@/lib/chain";
import { assertWeightInvariant } from "@/lib/weights";
import { formatSADate } from "@/lib/datetime";

async function generateNextWaybillNumber(siteCode: string, siteId: string, client: any = prisma): Promise<string> {
  const dateStr = formatSADate(new Date()).replace(/-/g, "");
  const prefix = `WB-${siteCode}-${dateStr}-`;
  const lastToday = await client.weighbridgeTransaction.findFirst({
    where: {
      siteId,
      waybillNumber: { startsWith: prefix },
    },
    orderBy: { waybillNumber: "desc" },
    select: { waybillNumber: true },
  });

  let nextVal = 1;
  if (lastToday?.waybillNumber) {
    const parts = lastToday.waybillNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(lastSeq) && lastSeq >= nextVal) {
      nextVal = lastSeq + 1;
    }
  }
  return `${prefix}${nextVal.toString().padStart(6, "0")}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (a.error) return a.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action, weightKg, saveOrderDefault } = body;

  const order = await prisma.weighbridgeOrder.findUnique({
    where: { id },
    include: {
      site: true,
      bookings: {
        include: {
          vehicle: true,
          driver: true,
          trailer: true,
          transactions: true,
        },
      },
    },
  });

  if (!order) return fail("Order not found", 404);

  const siteId = order.siteId;
  const siteCode = order.site.code;
  const now = new Date();

  // --------------------------------------------------------------------------
  // ACTION: APPLY_FIRST_WEIGH (Fast-track constant empty tare to all queued trucks)
  // --------------------------------------------------------------------------
  if (action === "APPLY_FIRST_WEIGH") {
    const tareKg = Math.round(Number(weightKg));
    if (!tareKg || tareKg <= 0) {
      return fail("A valid constant 1st weight (kg) is required", 422);
    }

    // Eligible trucks: bookings assigned to this order that are APPROVED (or PENDING)
    // and do NOT have an active or completed weighbridge transaction
    const eligibleBookings = order.bookings.filter((b) => {
      const hasActiveOrDoneTx = b.transactions.some((t) => t.status === "IN_PROGRESS" || t.status === "COMPLETED");
      return !hasActiveOrDoneTx && (b.status === "APPROVED" || b.status === "PENDING");
    });

    if (eligibleBookings.length === 0) {
      return fail("No waiting or pending trucks found for this order that need a 1st weighment", 400);
    }

    const isDispatch = order.type !== "RECEIPT";
    let processedCount = 0;

    for (const b of eligibleBookings) {
      const tempEdgeId = `FASTTRACK-1ST-${siteCode}-${b.id.slice(0, 8)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const tempWaybill = `WB-INPROG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const tempHash = createHash("sha256").update(`${tempEdgeId}:${now.toISOString()}`).digest("hex");

      try {
        await prisma.weighbridgeTransaction.create({
          data: {
            edgeTransactionId: tempEdgeId,
            bookingId: b.id,
            vehicleId: b.vehicleId,
            trailerId: b.trailerId,
            driverId: b.driverId,
            siteId,
            operatorId: a.session!.user.id,
            grossWeightKg: tareKg,
            tareWeightKg: tareKg,
            netWeightKg: 0,
            commodity: b.commodity || order.product,
            waybillNumber: tempWaybill,
            previousHash: "0".repeat(64),
            integrityHash: tempHash,
            status: "IN_PROGRESS",
            transactionType: "FIRST_WEIGH",
            entryAt: now,
            capturedAt: now,
            tareCapturedAt: isDispatch ? now : null,
            grossCapturedAt: isDispatch ? null : now,
          },
        });

        await prisma.booking.update({
          where: { id: b.id },
          data: { status: "ACTIVE" },
        });

        processedCount++;
      } catch (err: any) {
        console.warn(`Could not fast-track 1st weigh for booking ${b.reference}:`, err?.message);
      }
    }

    // Optionally save as order preset for subsequent arrivals
    if (saveOrderDefault) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE weighbridge_orders SET preset_tare_weight_kg = $1, use_constant_tare = TRUE, updated_at = NOW() WHERE id = $2::uuid`,
          tareKg,
          id
        );
      } catch (e) {
        console.warn("Could not persist constant tare setting on order:", e);
      }
    }

    await audit({
      userId: a.session!.user.id,
      siteId,
      action: "ORDER_FAST_TRACK_FIRST_WEIGH_APPLIED",
      entityType: "weighbridge_order",
      entityId: id,
      afterData: {
        orderNumber: order.orderNumber,
        tareWeightKg: tareKg,
        trucksAdvancedToYard: processedCount,
        savedAsOrderPreset: !!saveOrderDefault,
      },
    });

    return ok({
      action: "APPLY_FIRST_WEIGH",
      count: processedCount,
      weightKg: tareKg,
      message: `Successfully applied constant 1st weight (${tareKg.toLocaleString()} kg) to ${processedCount} truck(s). All ${processedCount} truck(s) are now in yard ready for 2nd weight!`,
    });
  }

  // --------------------------------------------------------------------------
  // ACTION: APPLY_SECOND_WEIGH (Fast-track constant loaded gross to all in-yard trucks)
  // --------------------------------------------------------------------------
  if (action === "APPLY_SECOND_WEIGH") {
    const grossKg = Math.round(Number(weightKg));
    if (!grossKg || grossKg <= 0) {
      return fail("A valid constant 2nd weight (kg) is required", 422);
    }

    // Find all active in-progress transactions for bookings under this order
    const inProgressTxs = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: id },
        status: "IN_PROGRESS",
      },
      include: {
        booking: true,
        vehicle: true,
      },
    });

    if (inProgressTxs.length === 0) {
      return fail("No in-yard trucks found for this order awaiting 2nd weighment", 400);
    }

    let processedCount = 0;

    for (const tx of inProgressTxs) {
      try {
        await prisma.$transaction(async (dbTx) => {
          const firstWeightKg = tx.tareCapturedAt !== null ? tx.tareWeightKg : tx.grossWeightKg;
          const actualGross = Math.max(firstWeightKg, grossKg);
          const actualTare = Math.min(firstWeightKg, grossKg);
          const netWeightKg = actualGross - actualTare;
          assertWeightInvariant(actualGross, actualTare, netWeightKg);

          const legalMaxGvw = tx.vehicle?.legalMaxGvwKg || 56000;
          const overload = actualGross > legalMaxGvw;
          const overloadVarianceKg = overload ? actualGross - legalMaxGvw : 0;

          const prior = await getChainHead(dbTx, siteId);
          const previousHash = prior.integrityHash;
          const waybillNumber = await generateNextWaybillNumber(siteCode, siteId, dbTx);
          const edgeTransactionId = `FASTTRACK-2ND-${siteCode}-${tx.id.slice(0, 8)}-${Date.now()}`;

          const integrityHash = computeIntegrityHash({
            edgeTransactionId,
            bookingId: tx.bookingId,
            vehicleId: tx.vehicleId,
            driverId: tx.driverId,
            siteId,
            grossWeightKg: actualGross,
            tareWeightKg: actualTare,
            netWeightKg,
            commodity: tx.commodity,
            capturedAt: now,
            waybillNumber,
            previousHash,
          });

          await dbTx.weighbridgeTransaction.update({
            where: { id: tx.id },
            data: {
              edgeTransactionId,
              grossWeightKg: actualGross,
              tareWeightKg: actualTare,
              netWeightKg,
              overload,
              overloadVarianceKg,
              waybillNumber,
              previousHash,
              integrityHash,
              status: "COMPLETED",
              transactionType: "SECOND_WEIGH",
              grossCapturedAt: tx.grossCapturedAt ?? now,
              tareCapturedAt: tx.tareCapturedAt ?? now,
              exitAt: now,
              capturedAt: now,
              operatorId: a.session!.user.id,
            },
          });

          await dbTx.booking.update({
            where: { id: tx.bookingId },
            data: { status: "COMPLETED" },
          });
        });

        processedCount++;
      } catch (err: any) {
        console.warn(`Could not fast-track 2nd weigh for tx ${tx.id}:`, err?.message);
      }
    }

    await syncOrderFulfillmentStatus(id);

    // Optionally save as order preset
    if (saveOrderDefault) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE weighbridge_orders SET preset_gross_weight_kg = $1, use_constant_gross = TRUE, updated_at = NOW() WHERE id = $2::uuid`,
          grossKg,
          id
        );
      } catch (e) {
        console.warn("Could not persist constant gross setting on order:", e);
      }
    }

    await audit({
      userId: a.session!.user.id,
      siteId,
      action: "ORDER_FAST_TRACK_SECOND_WEIGH_APPLIED",
      entityType: "weighbridge_order",
      entityId: id,
      afterData: {
        orderNumber: order.orderNumber,
        grossWeightKg: grossKg,
        trucksFinalized: processedCount,
        savedAsOrderPreset: !!saveOrderDefault,
      },
    });

    return ok({
      action: "APPLY_SECOND_WEIGH",
      count: processedCount,
      weightKg: grossKg,
      message: `Successfully finalized 2nd weighment (${grossKg.toLocaleString()} kg) for ${processedCount} truck(s). All waybills issued and transactions completed!`,
    });
  }

  // --------------------------------------------------------------------------
  // ACTION: SAVE_PRESETS (Update default constants on the order)
  // --------------------------------------------------------------------------
  if (action === "SAVE_PRESETS") {
    const { presetTareWeightKg, presetGrossWeightKg, useConstantTare, useConstantGross } = body;
    const tare = presetTareWeightKg ? Math.round(Number(presetTareWeightKg)) : null;
    const gross = presetGrossWeightKg ? Math.round(Number(presetGrossWeightKg)) : null;
    const enableTare = Boolean(useConstantTare);
    const enableGross = Boolean(useConstantGross);

    await prisma.$executeRawUnsafe(
      `UPDATE weighbridge_orders 
       SET preset_tare_weight_kg = $1,
           preset_gross_weight_kg = $2,
           use_constant_tare = $3,
           use_constant_gross = $4,
           updated_at = NOW()
       WHERE id = $5::uuid`,
      tare,
      gross,
      enableTare,
      enableGross,
      id
    );

    return ok({
      action: "SAVE_PRESETS",
      message: `Constant weights updated on order ${order.orderNumber}.`,
    });
  }

  return fail("Invalid fast-track action. Must be APPLY_FIRST_WEIGH, APPLY_SECOND_WEIGH, or SAVE_PRESETS.", 400);
}
