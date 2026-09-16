import { createHash } from "crypto";

export const WEIGHMENT_HASH_V1 = "wb.weighment.v1";

/**
 * Deterministic JSON serializer to guarantee identical byte output regardless of key insertion order.
 */
export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

export interface WeighmentHashInput {
  edgeTransactionId: string;
  bookingId: string;
  vehicleId: string;
  driverId: string;
  siteId: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  commodity: string;
  capturedAt: Date | string;
  waybillNumber: string;
  previousHash: string;
}

export function buildWeighmentPayload(t: WeighmentHashInput): string {
  const capturedAtStr = typeof t.capturedAt === "string" ? t.capturedAt : t.capturedAt.toISOString();
  return stableStringify({
    v: WEIGHMENT_HASH_V1,
    booking_id: t.bookingId,
    captured_at: capturedAtStr,
    commodity: t.commodity,
    driver_id: t.driverId,
    edge_transaction_id: t.edgeTransactionId,
    gross_weight_kg: t.grossWeightKg,
    net_weight_kg: t.netWeightKg,
    previous_hash: t.previousHash,
    site_id: t.siteId,
    tare_weight_kg: t.tareWeightKg,
    vehicle_id: t.vehicleId,
    waybill_number: t.waybillNumber,
  });
}

export function computeIntegrityHash(payloadOrInput: string | WeighmentHashInput): string {
  const payloadStr = typeof payloadOrInput === "string" ? payloadOrInput : buildWeighmentPayload(payloadOrInput);
  return createHash("sha256").update(payloadStr).digest("hex");
}
