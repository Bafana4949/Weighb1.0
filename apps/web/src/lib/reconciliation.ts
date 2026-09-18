import { createHash } from "node:crypto";
import { IncidentType, Prisma, Severity, SyncStatus, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stableStringify } from "@/lib/crypto";
import type { z } from "zod";
import { reconcileSchema } from "@/lib/validation";
import { runFraudChecks } from "@/lib/fraud";
import { logger } from "@/lib/logger";
import { syncOrderFulfillmentStatus } from "@/lib/order-fulfillment";
import { GENESIS_HASH, getChainHead } from "@/lib/chain";

export type ReconcileInput = z.infer<typeof reconcileSchema>;

export function computeEdgeIntegrityHash(input: ReconcileInput): string {
  const payload = {
    edge_transaction_id: input.edge_transaction_id,
    booking_id: input.booking_id,
    vehicle_id: input.vehicle_id,
    driver_id: input.driver_id,
    site_id: input.site_id,
    gross_weight_kg: input.gross_weight_kg,
    tare_weight_kg: input.tare_weight_kg,
    net_weight_kg: input.net_weight_kg,
    commodity: input.commodity,
    captured_at: input.captured_at.toISOString(),
    exit_at: input.exit_at?.toISOString() ?? null,
    turnaround_seconds: input.turnaround_seconds ?? null,
    waybill_number: input.waybill_number,
    previous_hash: input.previous_hash,
    overload: input.overload,
    overload_variance_kg: input.overload_variance_kg,
    underweight_empty: input.underweight_empty,
    overweight_loaded: input.overweight_loaded,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

async function runSerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
  throw new Error("SERIALIZABLE_RETRY_EXHAUSTED");
}

export async function reconcileTransaction(input: ReconcileInput) {
  const duplicate = await prisma.weighbridgeTransaction.findFirst({
    where: { OR: [{ edgeTransactionId: input.edge_transaction_id }, { integrityHash: input.integrity_hash }] },
  });
  if (duplicate) {
    logger.info("transaction_reconcile_duplicate", { edge_transaction_id: input.edge_transaction_id, site_id: input.site_id, waybill_number: input.waybill_number });
    return { duplicate: true as const, transaction: duplicate };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.booking_id },
    include: { vehicle: true, driver: true, site: true },
  });
  if (!booking) throw new Error("BOOKING_NOT_FOUND");
  if (booking.vehicleId !== input.vehicle_id || booking.driverId !== input.driver_id) throw new Error("BOOKING_IDENTITY_MISMATCH");
  if (booking.siteId !== input.site_id && booking.site.code !== input.site_id) throw new Error("SITE_MISMATCH");
  if (input.gross_weight_kg - input.tare_weight_kg !== input.net_weight_kg) throw new Error("NET_WEIGHT_MISMATCH");
  if (input.tare_weight_kg !== booking.vehicle.tareWeightKg) throw new Error("TARE_WEIGHT_MISMATCH");
  if (computeEdgeIntegrityHash(input) !== input.integrity_hash) throw new Error("INTEGRITY_HASH_MISMATCH");

  // Not part of computeEdgeIntegrityHash's payload — the daemon's hash chain is
  // lane-independent by design, so a booking's lane attribution can't fail
  // reconciliation just because it's missing or wrong. Best-effort attribution
  // only; an unmatched lane_number quietly leaves laneId null.
  const lane = input.lane_number
    ? await prisma.lane.findUnique({ where: { siteId_laneNumber: { siteId: booking.siteId, laneNumber: input.lane_number } } })
    : null;

  const config = await prisma.siteConfig.findUnique({ where: { siteId: booking.siteId } });
  const tolerance = Number(config?.overloadTolerancePercent ?? 5) / 100;
  const allowedNet = Math.round(booking.targetTonnageKg * (1 + tolerance));
  const overloadVarianceKg = Math.max(0, input.net_weight_kg - allowedNet, input.gross_weight_kg - booking.vehicle.legalMaxGvwKg);
  const overload = overloadVarianceKg > 0;
  const underweightEmpty = input.underweight_empty;
  const overweightLoaded = input.overweight_loaded;
  const held = overload || underweightEmpty || overweightLoaded;

  const result = await runSerializable(() => prisma.$transaction(async (tx) => {
    // Acquire site-level advisory xact lock to serialize with manual route
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.siteId}))`;

    // Recheck idempotency and the site chain inside the same serializable transaction.
    const duplicateInTransaction = await tx.weighbridgeTransaction.findFirst({
      where: { OR: [{ edgeTransactionId: input.edge_transaction_id }, { integrityHash: input.integrity_hash }] },
    });
    if (duplicateInTransaction) return { duplicate: true as const, transaction: duplicateInTransaction };

    const prior = await getChainHead(tx, booking.siteId);
    if (prior.integrityHash !== input.previous_hash) {
      // Check if the previous_hash points to a valid historical predecessor at this site
      // (occurs when offline edge queue catches up after interim weighments occurred at the site)
      const historicalPredecessor = await tx.weighbridgeTransaction.findFirst({
        where: {
          siteId: booking.siteId,
          integrityHash: input.previous_hash,
          status: { in: [TransactionStatus.COMPLETED, TransactionStatus.HELD] },
        },
      });

      if (!historicalPredecessor && input.previous_hash !== GENESIS_HASH) {
        logger.error("transaction_hash_chain_mismatch", {
          site_id: booking.siteId,
          edge_transaction_id: input.edge_transaction_id,
          expected_previous_hash: prior.integrityHash,
          received_previous_hash: input.previous_hash,
        });
        throw new Error("HASH_CHAIN_MISMATCH");
      }

      logger.warn("transaction_hash_chain_offline_recovery", {
        site_id: booking.siteId,
        edge_transaction_id: input.edge_transaction_id,
        historical_predecessor_id: historicalPredecessor?.id ?? "genesis",
      });
    }

    const transaction = await tx.weighbridgeTransaction.create({ data: {
      edgeTransactionId: input.edge_transaction_id,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      trailerId: input.trailer_id ?? booking.trailerId,
      driverId: booking.driverId,
      siteId: booking.siteId,
      laneId: lane?.id ?? null,
      grossWeightKg: input.gross_weight_kg,
      tareWeightKg: input.tare_weight_kg,
      netWeightKg: input.net_weight_kg,
      commodity: input.commodity,
      overload,
      overloadVarianceKg,
      underweightEmptyFlag: underweightEmpty,
      overweightLoadedFlag: overweightLoaded,
      driverDecision: input.driver_decision,
      anprConfidence: input.anpr_confidence,
      entryPhotoUrl: input.entry_photo_url,
      scalePhotoUrl: input.scale_photo_url,
      waybillNumber: input.waybill_number,
      previousHash: input.previous_hash,
      integrityHash: input.integrity_hash,
      syncStatus: SyncStatus.SYNCED,
      status: held ? TransactionStatus.HELD : TransactionStatus.COMPLETED,
      entryAt: input.entry_at,
      capturedAt: input.captured_at,
      exitAt: input.exit_at,
      turnaroundSeconds: input.turnaround_seconds,
      confirmationHash: createHash("sha256").update(`${input.integrity_hash}:${Date.now()}`).digest("hex"),
    } });
    await tx.booking.update({ where: { id: booking.id }, data: { status: held ? "ACTIVE" : "COMPLETED" } });
    if (!held && booking.orderId) {
      await syncOrderFulfillmentStatus(booking.orderId, tx);
    }
    await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { lastTareWeightKg: input.tare_weight_kg } });
    if (overload) await tx.incident.create({ data: {
      siteId: booking.siteId,
      bookingId: booking.id,
      transactionId: transaction.id,
      vehicleId: booking.vehicleId,
      driverId: booking.driverId,
      type: IncidentType.OVERLOAD,
      severity: Severity.HIGH,
      title: "Overload confirmed during reconciliation",
      description: `Cloud validation calculated an overload variance of ${overloadVarianceKg} kg.`,
      anomalyScore: 25,
    } });
    if (underweightEmpty) await tx.incident.create({ data: {
      siteId: booking.siteId,
      bookingId: booking.id,
      transactionId: transaction.id,
      vehicleId: booking.vehicleId,
      driverId: booking.driverId,
      type: IncidentType.UNDERWEIGHT_EMPTY,
      severity: Severity.HIGH,
      title: "Underweight empty vehicle confirmed during reconciliation",
      description: `Empty gross weight ${input.gross_weight_kg} kg was not under the configured empty-vehicle limit.`,
      anomalyScore: 25,
    } });
    if (overweightLoaded) await tx.incident.create({ data: {
      siteId: booking.siteId,
      bookingId: booking.id,
      transactionId: transaction.id,
      vehicleId: booking.vehicleId,
      driverId: booking.driverId,
      type: IncidentType.OVERLOAD,
      severity: Severity.HIGH,
      title: "Loaded vehicle weight limit exceeded during reconciliation",
      description: `Loaded gross weight ${input.gross_weight_kg} kg exceeded the configured loaded-vehicle limit.`,
      anomalyScore: 25,
    } });
    return { duplicate: false as const, transaction };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  if (!result.duplicate) {
    logger.info("transaction_reconciled", { transaction_id: result.transaction.id, site_id: result.transaction.siteId, waybill_number: result.transaction.waybillNumber, overload: result.transaction.overload, held: result.transaction.status === "HELD" });
    await runFraudChecks(result.transaction.id);
  }
  return result;
}
