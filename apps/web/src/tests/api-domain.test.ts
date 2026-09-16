import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";
import { mineScope, roleAllowed } from "@/lib/access";
import { bookingSchema, transporterSchema } from "@/lib/validation";
import { aggregateTransactionRows } from "@/lib/reports";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { weighbridgeTransaction: { findFirst } } }));
vi.mock("@/lib/fraud", () => ({ runFraudChecks: vi.fn() }));

import { computeEdgeIntegrityHash, reconcileTransaction } from "@/lib/reconciliation";

describe("API domain rules", () => {
  beforeEach(() => findFirst.mockReset());

  it("enforces role boundaries", () => {
    expect(roleAllowed(UserRole.ADMIN, [UserRole.ADMIN])).toBe(true);
    expect(roleAllowed(UserRole.TRANSPORTER, [UserRole.ADMIN, UserRole.OPERATOR])).toBe(false);
  });

  it("scopes mining-company admins to their own org, and throws on missing org", () => {
    expect(mineScope("company-a")).toEqual({ organisationId: "company-a" });
    expect(() => mineScope(null)).toThrow("Tenant scope required");
  });

  it("validates a transporter onboarding submission", () => {
    const base = { companyName: "Acme Haulage", firstName: "Amy", lastName: "Botha", email: "a@b.com", password: "x".repeat(12) };
    expect(transporterSchema.safeParse(base).success).toBe(true);
    expect(transporterSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });

  it("validates booking window ordering", () => {
    const result = bookingSchema.safeParse({
      vehicleId: "7fef6f8b-cdf2-46de-a780-88b10cc9ca50",
      driverId: "7fef6f8b-cdf2-46de-a780-88b10cc9ca51",
      siteId: "7fef6f8b-cdf2-46de-a780-88b10cc9ca52",
      commodity: "IRON_ORE", targetTonnageKg: 36000,
      windowStart: "2026-07-22T12:00:00Z", windowEnd: "2026-07-22T11:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate reconciliation by idempotent identity", async () => {
    findFirst.mockResolvedValue({ id: "existing", edgeTransactionId: "edge" });
    const payload = {
      edge_transaction_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca50",
      booking_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca51",
      vehicle_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca52",
      driver_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca53",
      site_id: "SISHEN-NG", gross_weight_kg: 52000, tare_weight_kg: 18000, net_weight_kg: 34000,
      commodity: "IRON_ORE", captured_at: new Date("2026-07-22T10:00:00.000Z"), waybill_number: "WB-SISHEN-NG-20260722-000001",
      previous_hash: "0".repeat(64), integrity_hash: "a".repeat(64), overload: false, overload_variance_kg: 0,
      underweight_empty: false, overweight_loaded: false,
    };
    const result = await reconcileTransaction(payload);
    expect(result.duplicate).toBe(true);
  });

  it("aggregates report values accurately", () => {
    expect(aggregateTransactionRows([{ netWeightKg: 32000, turnaroundSeconds: 1200 }, { netWeightKg: 34000, turnaroundSeconds: 1800 }])).toEqual({ transactionCount: 2, totalTonnageKg: 66000, averageLoadKg: 33000, averageTurnaroundSeconds: 1500 });
  });

  it("computes a deterministic edge integrity hash", () => {
    const input = {
      edge_transaction_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca50", booking_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca51",
      vehicle_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca52", driver_id: "7fef6f8b-cdf2-46de-a780-88b10cc9ca53",
      site_id: "SISHEN-NG", gross_weight_kg: 52000, tare_weight_kg: 18000, net_weight_kg: 34000, commodity: "IRON_ORE",
      captured_at: new Date("2026-07-22T10:00:00.000Z"), waybill_number: "WB-SISHEN-NG-20260722-000001",
      previous_hash: "0".repeat(64), integrity_hash: "a".repeat(64), overload: false, overload_variance_kg: 0,
      underweight_empty: false, overweight_loaded: false,
    };
    expect(computeEdgeIntegrityHash(input)).toMatch(/^[a-f0-9]{64}$/);
    expect(computeEdgeIntegrityHash(input)).toBe(computeEdgeIntegrityHash(input));
  });

  it("formats exact kilograms with zero rounding and enforces invariant", async () => {
    const { formatKg, parseManualKg, assertWeightInvariant } = await import("@/lib/weights");
    // Exact formatting - no 20kg rounding
    expect(formatKg(14532)).toContain("14");
    expect(formatKg(14532)).toContain("532");
    expect(formatKg(14532)).toContain("kg");

    // Invariant: gross - tare = net
    expect(() => assertWeightInvariant(52100, 18100, 34000)).not.toThrow();
    expect(() => assertWeightInvariant(52100, 18100, 33999)).toThrow("Weight invariant violated");

    // Strict manual parsing
    expect(parseManualKg("14532")).toBe(14532);
    expect(parseManualKg(" 14 532 ")).toBe(14532);
    expect(parseManualKg("14.5")).toBeNull();
    expect(parseManualKg("-14500")).toBeNull();
    expect(parseManualKg("noise123")).toBeNull();
  });
});
