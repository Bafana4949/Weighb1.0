import { describe, expect, it } from "vitest";
import type { HardwareDeviceType } from "@prisma/client";
import { highestSupportedTier, MANUAL_ENTRY_POLICY, resolveSiteCapabilities, type DeviceSummary } from "@/lib/tiers";
import { manualEntryError } from "@/lib/site-capabilities";

const dev = (...types: HardwareDeviceType[]): DeviceSummary[] => types.map((type) => ({ type, isActive: true }));
const FULL_KIT = dev("SCALE", "EDGE_DAEMON", "RFID_READER", "POSITION_SENSOR", "TRAFFIC_LIGHT", "ENTRY_GATE", "EXIT_GATE", "ANPR_CAMERA", "PRINTER");

describe("Tier capability model", () => {
  describe("Manual", () => {
    it("is ready with no hardware at all (typed weights only)", () => {
      const r = resolveSiteCapabilities({ tier: "MANUAL", devices: [] });
      expect(r.ready).toBe(true);
      expect(r.manualEntryPolicy).toBe("PRIMARY");
    });
    it("never requires a card, even when an RFID reader is installed", () => {
      const r = resolveSiteCapabilities({ tier: "MANUAL", devices: dev("RFID_READER", "SCALE"), overrides: { requireCardIdentification: true } });
      expect(r.capabilities.cardIdentification.enabled).toBe(true);
      expect(r.requireCardIdentification).toBe(false);
    });
    it("does not use gate automation or ANPR even if installed, and says so", () => {
      const r = resolveSiteCapabilities({ tier: "MANUAL", devices: dev("ENTRY_GATE", "ANPR_CAMERA") });
      expect(r.capabilities.gateAutomation.enabled).toBe(false);
      expect(r.capabilities.anpr.enabled).toBe(false);
      expect(r.issues.filter((i) => i.severity === "warning").map((i) => i.capability)).toEqual(expect.arrayContaining(["gateAutomation", "anpr"]));
    });
    it("uses the indicator when one is configured", () => {
      expect(resolveSiteCapabilities({ tier: "MANUAL", devices: dev("SCALE") }).capabilities.indicatorIntegration.enabled).toBe(true);
    });
  });

  describe("Semi-automatic", () => {
    it("requires an integrated indicator", () => {
      const r = resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: [] });
      expect(r.ready).toBe(false);
      expect(r.issues.some((i) => i.severity === "blocker" && i.capability === "indicatorIntegration")).toBe(true);
    });
    it("is ready with an indicator; card readers and beams are recommended, not required", () => {
      const r = resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: dev("SCALE") });
      expect(r.ready).toBe(true);
      expect(r.issues.some((i) => i.capability === "cardIdentification" && i.severity === "warning")).toBe(true);
    });
    it("lets the operator type a weight with a reason", () => {
      expect(MANUAL_ENTRY_POLICY.SEMI_AUTOMATIC).toBe("REASON_REQUIRED");
    });
    it("requires a card scan only when the site opts in and a reader exists", () => {
      expect(resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: dev("SCALE", "NFC_READER") }).requireCardIdentification).toBe(false);
      expect(resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: dev("SCALE", "NFC_READER"), overrides: { requireCardIdentification: true } }).requireCardIdentification).toBe(true);
      expect(resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: dev("SCALE"), overrides: { requireCardIdentification: true } }).requireCardIdentification).toBe(false);
    });
  });

  describe("Fully automatic", () => {
    it("blocks activation until gates, lights, beams, card reader and edge are configured", () => {
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices: dev("SCALE") });
      const missing = r.issues.filter((i) => i.severity === "blocker").map((i) => i.capability);
      expect(missing).toEqual(expect.arrayContaining(["gateAutomation", "trafficLights", "positioningValidation", "cardIdentification", "edgeController"]));
    });
    it("is ready with the full kit and always requires card identification", () => {
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices: FULL_KIT });
      expect(r.ready).toBe(true);
      expect(r.requireCardIdentification).toBe(true);
      expect(r.manualEntryPolicy).toBe("SUPERVISOR_OVERRIDE");
    });
    it("keeps automating with one gate while the other is in maintenance", () => {
      const devices = FULL_KIT.map((d) => (d.type === "ENTRY_GATE" ? { ...d, maintenanceMode: true } : d));
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices });
      expect(r.ready).toBe(true);
      expect(r.capabilities.gateAutomation.enabled).toBe(true);
    });
    it("routes to an operator (warning, not blocker) when all required hardware of a kind is in maintenance", () => {
      const devices = FULL_KIT.map((d) => (d.type === "ENTRY_GATE" || d.type === "EXIT_GATE" ? { ...d, maintenanceMode: true } : d));
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices });
      expect(r.ready).toBe(true);
      expect(r.capabilities.gateAutomation.enabled).toBe(false);
      expect(r.issues.some((i) => i.capability === "gateAutomation" && i.severity === "warning")).toBe(true);
    });
    it("disabling a capability on site turns it off without removing hardware", () => {
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices: FULL_KIT, overrides: { disabled: ["anpr"] } });
      expect(r.capabilities.anpr.hardwarePresent).toBe(true);
      expect(r.capabilities.anpr.enabled).toBe(false);
    });
  });

  describe("Licence", () => {
    it("caps the effective tier at the company licence and blocks the site", () => {
      const r = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", licensedTier: "SEMI_AUTOMATIC", devices: FULL_KIT });
      expect(r.effectiveTier).toBe("SEMI_AUTOMATIC");
      expect(r.ready).toBe(false);
    });
  });

  describe("Upgrade path", () => {
    it("reports the highest tier the installed hardware supports", () => {
      expect(highestSupportedTier([])).toBe("MANUAL");
      expect(highestSupportedTier(dev("SCALE"))).toBe("SEMI_AUTOMATIC");
      expect(highestSupportedTier(FULL_KIT)).toBe("FULLY_AUTOMATIC");
    });
  });
});

describe("Manual weight entry policy", () => {
  const manual = resolveSiteCapabilities({ tier: "MANUAL", devices: [] });
  const semi = resolveSiteCapabilities({ tier: "SEMI_AUTOMATIC", devices: dev("SCALE") });
  const full = resolveSiteCapabilities({ tier: "FULLY_AUTOMATIC", devices: FULL_KIT });

  it("Manual: typed weights need nothing", () => {
    expect(manualEntryError(manual, "MANUAL", null, false)).toBeNull();
  });
  it("indicator readings are always accepted", () => {
    expect(manualEntryError(full, "INDICATOR", null, false)).toBeNull();
  });
  it("Semi-automatic: typed weights need a reason", () => {
    expect(manualEntryError(semi, "MANUAL", "", false)).toMatch(/reason/i);
    expect(manualEntryError(semi, "MANUAL", "Indicator offline", false)).toBeNull();
  });
  it("Fully automatic: typed weights need a reason and the override permission", () => {
    expect(manualEntryError(full, "MANUAL", "Indicator offline", false)).toMatch(/supervisor/i);
    expect(manualEntryError(full, "MANUAL", "Indicator offline", true)).toBeNull();
  });
});
