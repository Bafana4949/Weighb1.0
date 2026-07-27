import { createHash } from "node:crypto";
import { IncidentType, Prisma, Severity, SyncStatus, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stableStringify } from "@/lib/crypto";
import type { z } from "zod";
import { reconcileSchema } from "@/lib/validation";
import { runFraudChecks } from "@/lib/fraud";

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
  if (duplicate) return { duplicate: true as const, transaction: duplicate };

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

  const config = await prisma.siteConfig.findUnique({ where: { siteId: booking.siteId } });
  const tolerance = Number(config?.overloadTolerancePercent ?? 5) / 100;
  const allowedNet = Math.round(booking.targetTonnageKg * (1 + tolerance));
  const overloadVarianceKg = Math.max(0, input.net_weight_kg - allowedNet, input.gross_weight_kg - booking.vehicle.legalMaxGvwKg);
  const overload = overloadVarianceKg > 0;
  const underweightEmpty = input.underweight_empty;
  const overweightLoaded = input.overweight_loaded;
  const held = overload || underweightEmpty || overweightLoaded;

  const result = await runSerializable(() => prisma.$transaction(async (tx) => {
    // Recheck idempotency and the site chain inside the same serializable transaction.
    const duplicateInTransaction = await tx.weighbridgeTransaction.findFirst({
      where: { OR: [{ edgeTransactionId: input.edge_transaction_id }, { integrityHash: input.integrity_hash }] },
    });
    if (duplicateInTransaction) return { duplicate: true as const, transaction: duplicateInTransaction };

    const prior = await tx.weighbridgeTransaction.findFirst({
      where: { siteId: booking.siteId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if ((prior?.integrityHash ?? "0".repeat(64)) !== input.previous_hash) throw new Error("HASH_CHAIN_MISMATCH");

    const transaction = await tx.weighbridgeTransaction.create({ data: {
      edgeTransactionId: input.edge_transaction_id,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      trailerId: input.trailer_id ?? booking.trailerId,
      driverId: booking.driverId,
      siteId: booking.siteId,
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

  if (!result.duplicate) await runFraudChecks(result.transaction.id);
  return result;
}
