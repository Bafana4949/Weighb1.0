import { describe, it, expect } from "vitest";
import {
  mineScope,
  userScope,
  userSiteScope,
  transporterScope,
  resolveScope,
  TenantScopeError,
  withScopeErrors,
} from "@/lib/access";
import { formatKg, parseManualKg, assertWeightInvariant } from "@/lib/weights";

describe("Multi-Tenant Personas & Access Scoping Hardening", () => {
  // Persona 1: Platform Super Admin (Bafana Bhuda)
  const superAdmin = {
    id: "user-bafana",
    email: "bafana@weighbridge.system",
    role: "ADMIN" as const,
    organisationId: null,
    platformRole: "PLATFORM_SUPER_ADMIN" as const,
  };

  // Persona 2: Client / Tenant Admin (Grant Howell - Coal In Motion)
  const clientAdmin = {
    id: "user-grant",
    email: "grant@coalinmotion.co.za",
    role: "ADMIN" as const,
    organisationId: "COALINMOTI",
    platformRole: null,
  };

  // Persona 3: Transporter User
  const transporter = {
    id: "user-transporter",
    email: "ops@bulkhaulier.co.za",
    role: "TRANSPORTER" as const,
    organisationId: "HAULIER_ABC",
    platformRole: null,
  };

  // Persona 4: Corrupted / Unlinked Tenant User (Fail-Closed Target)
  const unlinkedUser = {
    id: "user-unlinked",
    email: "unlinked@nowhere.com",
    role: "OPERATOR" as const,
    organisationId: null,
    platformRole: null,
  };

  describe("userScope(user)", () => {
    it("returns platform-wide {} for Platform Super Admin (Bafana Bhuda) with null organisationId", () => {
      const scope = userScope(superAdmin);
      expect(scope).toEqual({});
    });

    it("returns strict organisationId filter for Client Admin (Grant Howell)", () => {
      const scope = userScope(clientAdmin);
      expect(scope).toEqual({ organisationId: "COALINMOTI" });
    });

    it("returns strict organisationId filter for Transporter", () => {
      const scope = userScope(transporter);
      expect(scope).toEqual({ organisationId: "HAULIER_ABC" });
    });

    it("strictly throws TenantScopeError for non-superadmin users without organisationId", () => {
      expect(() => userScope(unlinkedUser)).toThrow(TenantScopeError);
      expect(() => userScope(null)).toThrow(TenantScopeError);
      expect(() => userScope(undefined)).toThrow(TenantScopeError);
    });
  });

  describe("userSiteScope(user)", () => {
    it("returns platform-wide {} for Platform Super Admin", () => {
      const scope = userSiteScope(superAdmin);
      expect(scope).toEqual({});
    });

    it("returns site relation filter for Client Admin", () => {
      const scope = userSiteScope(clientAdmin);
      expect(scope).toEqual({ site: { organisationId: "COALINMOTI" } });
    });

    it("strictly throws TenantScopeError for unlinked non-superadmin", () => {
      expect(() => userSiteScope(unlinkedUser)).toThrow(TenantScopeError);
    });
  });

  describe("transporterScope(user)", () => {
    it("returns booking transporter organisation filter", () => {
      const scope = transporterScope(transporter);
      expect(scope).toEqual({ booking: { transporterOrganisationId: "HAULIER_ABC" } });
    });

    it("throws TenantScopeError if transporter has no organisationId", () => {
      expect(() => transporterScope(unlinkedUser)).toThrow(TenantScopeError);
    });
  });

  describe("resolveScope(user) discriminated union", () => {
    it("resolves to kind: 'platform' for Super Admin", () => {
      const resolved = resolveScope(superAdmin);
      expect(resolved).toEqual({ kind: "platform" });
    });

    it("resolves to kind: 'tenant' with organisationId for Client Admin", () => {
      const resolved = resolveScope(clientAdmin);
      expect(resolved).toEqual({ kind: "tenant", organisationId: "COALINMOTI" });
    });
  });

  describe("mineScope(organisationId) single-argument strictness", () => {
    it("returns organisationId when passed a valid string", () => {
      expect(mineScope("org-123")).toEqual({ organisationId: "org-123" });
    });

    it("strictly throws TenantScopeError when passed null or undefined", () => {
      expect(() => mineScope(null)).toThrow(TenantScopeError);
      expect(() => mineScope(undefined)).toThrow(TenantScopeError);
      expect(() => mineScope("")).toThrow(TenantScopeError);
    });
  });

  describe("withScopeErrors handler wrapper", () => {
    it("catches TenantScopeError and returns a 403 response", async () => {
      const handler = withScopeErrors(async () => {
        throw new TenantScopeError("Organisation scope required");
      });
      const response = await handler();
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Tenant organisation scope required");
    });

    it("rethrows unhandled non-tenant errors", async () => {
      const handler = withScopeErrors(async () => {
        throw new Error("Database connection lost");
      });
      await expect(handler()).rejects.toThrow("Database connection lost");
    });

    it("passes through successful responses unmodified", async () => {
      const handler = withScopeErrors(async () => {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      const response = await handler();
      expect(response.status).toBe(200);
    });
  });

  describe("Weights precision — Zero rounding verification", () => {
    it("formats valid integer kg with South African NBSP spacing", () => {
      const NBSP = "\u00A0";
      expect(formatKg(14532)).toBe(`14${NBSP}532${NBSP}kg`);
      expect(formatKg(0)).toBe(`0${NBSP}kg`);
    });

    it("strictly THROWS on floating-point weights rather than rounding silently", () => {
      expect(() => formatKg(14532.4)).toThrow("Non-integer kg: 14532.4");
      expect(() => formatKg(50000.99)).toThrow("Non-integer kg: 50000.99");
      expect(() => formatKg(NaN)).toThrow("Non-integer kg: NaN");
    });

    it("parses valid manual operator integers without coercion", () => {
      expect(parseManualKg("14532")).toBe(14532);
      expect(parseManualKg("  14 532 ")).toBe(14532);
    });

    it("strictly rejects decimals or noisy input in parseManualKg", () => {
      expect(parseManualKg("14532.5")).toBeNull();
      expect(parseManualKg("14,532.50")).toBeNull();
      expect(parseManualKg("-100")).toBeNull();
      expect(parseManualKg("abc")).toBeNull();
    });

    it("assertWeightInvariant enforces gross - tare === net", () => {
      expect(() => assertWeightInvariant(45000, 15000, 30000)).not.toThrow();
      expect(() => assertWeightInvariant(45000, 15000, 29980)).toThrow("Weight invariant violated");
    });
  });
});
