import type { HardwareDeviceType, OperatingTier } from "@prisma/client";

/**
 * One platform, three commercial tiers. A tier never forks code: it only decides
 * which capabilities a site may use. What a site actually does is
 * tier ∩ company licence ∩ installed hardware ∩ per-site overrides.
 * Pure module (no Prisma client, no Next imports) so it runs in tests and on the client.
 */

export const TIERS = ["MANUAL", "SEMI_AUTOMATIC", "FULLY_AUTOMATIC"] as const satisfies readonly OperatingTier[];

export const TIER_LABEL: Record<OperatingTier, string> = {
  MANUAL: "Manual",
  SEMI_AUTOMATIC: "Semi-Automatic",
  FULLY_AUTOMATIC: "Fully Automatic",
};

export const TIER_SUMMARY: Record<OperatingTier, string> = {
  MANUAL: "Operator-driven weighing with minimal hardware. Indicator integration optional.",
  SEMI_AUTOMATIC: "Automatic scale reading and card identification with operator confirmation.",
  FULLY_AUTOMATIC: "Unattended flow: identification, positioning, gates and lights automated; exceptions routed to an operator.",
};

const RANK: Record<OperatingTier, number> = { MANUAL: 1, SEMI_AUTOMATIC: 2, FULLY_AUTOMATIC: 3 };

export function tierRank(tier: OperatingTier): number {
  return RANK[tier];
}

export function minTier(a: OperatingTier, b: OperatingTier): OperatingTier {
  return RANK[a] <= RANK[b] ? a : b;
}

/** unavailable: cannot be enabled at this tier. optional: allowed if hardware installed.
 *  included: on whenever the hardware is present; recommended. required: the site cannot be activated without it. */
export type Availability = "unavailable" | "optional" | "included" | "required";

export type CapabilityKey =
  | "indicatorIntegration"
  | "cardIdentification"
  | "qrIdentification"
  | "anpr"
  | "positioningValidation"
  | "trafficLights"
  | "gateAutomation"
  | "edgeController"
  | "selfServiceKiosk"
  | "cctv"
  | "ticketPrinting";

type CapabilityDefinition = {
  label: string;
  description: string;
  /** Any one of these device types satisfies the capability. */
  hardware: HardwareDeviceType[];
  tiers: Record<OperatingTier, Availability>;
};

export const CAPABILITIES: Record<CapabilityKey, CapabilityDefinition> = {
  indicatorIntegration: {
    label: "Automatic scale reading",
    description: "Weight is read from the indicator instead of typed.",
    hardware: ["SCALE"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "required", FULLY_AUTOMATIC: "required" },
  },
  cardIdentification: {
    label: "RFID / NFC identification",
    description: "Vehicle or driver identified by card or tag.",
    hardware: ["RFID_READER", "NFC_READER"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "included", FULLY_AUTOMATIC: "required" },
  },
  qrIdentification: {
    label: "QR identification",
    description: "Booking or journey token scanned from a QR code.",
    hardware: ["QR_SCANNER"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "optional" },
  },
  anpr: {
    label: "ANPR",
    description: "Number plate recognised by camera.",
    hardware: ["ANPR_CAMERA"],
    tiers: { MANUAL: "unavailable", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "included" },
  },
  positioningValidation: {
    label: "Positioning validation",
    description: "Beams confirm the vehicle is fully on the deck before capture.",
    hardware: ["POSITION_SENSOR"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "included", FULLY_AUTOMATIC: "required" },
  },
  trafficLights: {
    label: "Traffic lights",
    description: "Red/green guidance on and off the deck.",
    hardware: ["TRAFFIC_LIGHT"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "included", FULLY_AUTOMATIC: "required" },
  },
  gateAutomation: {
    label: "Automatic boom gates",
    description: "Gates open on an authorised, completed step. Manual sites operate gates by hand.",
    hardware: ["ENTRY_GATE", "EXIT_GATE"],
    tiers: { MANUAL: "unavailable", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "required" },
  },
  edgeController: {
    label: "Edge controller (offline operation)",
    description: "On-site controller keeps weighing during internet outages and reconciles later.",
    hardware: ["EDGE_DAEMON"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "included", FULLY_AUTOMATIC: "required" },
  },
  selfServiceKiosk: {
    label: "Driver self-service kiosk",
    description: "Drivers confirm details at a touchscreen without an operator.",
    hardware: ["KIOSK"],
    tiers: { MANUAL: "unavailable", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "optional" },
  },
  cctv: {
    label: "CCTV evidence",
    description: "Camera snapshots attached to transactions.",
    hardware: ["CCTV_CAMERA"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "optional" },
  },
  ticketPrinting: {
    label: "Ticket printing",
    description: "Waybill or receipt printed at the weighbridge.",
    hardware: ["PRINTER"],
    tiers: { MANUAL: "optional", SEMI_AUTOMATIC: "optional", FULLY_AUTOMATIC: "included" },
  },
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

/**
 * How typed weights are treated. Manual sites type weights as normal; higher tiers
 * keep typed entry as a backup that must be justified, so the indicator stays the
 * source of truth and every deviation is auditable.
 */
export type ManualEntryPolicy = "PRIMARY" | "REASON_REQUIRED" | "SUPERVISOR_OVERRIDE";

export const MANUAL_ENTRY_POLICY: Record<OperatingTier, ManualEntryPolicy> = {
  MANUAL: "PRIMARY",
  SEMI_AUTOMATIC: "REASON_REQUIRED",
  FULLY_AUTOMATIC: "SUPERVISOR_OVERRIDE",
};

export type SiteFeatureOverrides = {
  /** Semi-automatic sites may opt in to requiring a card scan before the first weight. */
  requireCardIdentification?: boolean;
  /** Turn a capability off at a site even though hardware is present (e.g. gate under repair). */
  disabled?: CapabilityKey[];
};

export type DeviceSummary = { type: HardwareDeviceType; isActive: boolean; maintenanceMode?: boolean | null };

export type CapabilityState = {
  availability: Availability;
  hardwarePresent: boolean;
  enabled: boolean;
};

export type ReadinessIssue = { severity: "blocker" | "warning"; capability?: CapabilityKey; message: string };

export type ResolvedSiteCapabilities = {
  tier: OperatingTier;
  licensedTier: OperatingTier;
  /** The tier the site actually runs at: never above the company licence. */
  effectiveTier: OperatingTier;
  capabilities: Record<CapabilityKey, CapabilityState>;
  manualEntryPolicy: ManualEntryPolicy;
  requireCardIdentification: boolean;
  issues: ReadinessIssue[];
  ready: boolean;
};

export function parseOverrides(value: unknown): SiteFeatureOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: SiteFeatureOverrides = {};
  if (typeof raw.requireCardIdentification === "boolean") out.requireCardIdentification = raw.requireCardIdentification;
  if (Array.isArray(raw.disabled)) out.disabled = raw.disabled.filter((k): k is CapabilityKey => typeof k === "string" && k in CAPABILITIES);
  return out;
}

export function resolveSiteCapabilities(input: {
  tier: OperatingTier;
  licensedTier?: OperatingTier | null;
  devices: DeviceSummary[];
  overrides?: unknown;
}): ResolvedSiteCapabilities {
  const licensedTier = input.licensedTier ?? "FULLY_AUTOMATIC";
  const effectiveTier = minTier(input.tier, licensedTier);
  const overrides = parseOverrides(input.overrides);
  const working = new Set(input.devices.filter((d) => d.isActive && !d.maintenanceMode).map((d) => d.type));
  const installed = new Set(input.devices.filter((d) => d.isActive).map((d) => d.type));
  const issues: ReadinessIssue[] = [];

  if (tierRank(input.tier) > tierRank(licensedTier)) {
    issues.push({ severity: "blocker", message: `Company licence permits up to ${TIER_LABEL[licensedTier]}; site is set to ${TIER_LABEL[input.tier]}.` });
  }

  const capabilities = {} as Record<CapabilityKey, CapabilityState>;
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key];
    const availability = def.tiers[effectiveTier];
    const hardwarePresent = def.hardware.some((t) => working.has(t));
    const configured = def.hardware.some((t) => installed.has(t));
    const disabled = overrides.disabled?.includes(key) ?? false;
    capabilities[key] = { availability, hardwarePresent, enabled: availability !== "unavailable" && hardwarePresent && !disabled };

    if (availability === "required" && !configured) {
      issues.push({ severity: "blocker", capability: key, message: `${TIER_LABEL[effectiveTier]} sites require ${def.label.toLowerCase()} hardware.` });
    } else if (availability === "required" && !hardwarePresent) {
      issues.push({ severity: "warning", capability: key, message: `${def.label} hardware is in maintenance; the lane will route to an operator.` });
    } else if (availability === "included" && !configured) {
      issues.push({ severity: "warning", capability: key, message: `${def.label} is recommended at ${TIER_LABEL[effectiveTier]}.` });
    } else if (availability === "unavailable" && configured) {
      issues.push({ severity: "warning", capability: key, message: `${def.label} hardware is installed but not used at ${TIER_LABEL[effectiveTier]}.` });
    }
  }

  // Manual sites never require a card; fully automatic sites always do when a reader exists.
  const requireCardIdentification =
    capabilities.cardIdentification.enabled &&
    (effectiveTier === "FULLY_AUTOMATIC" || (effectiveTier === "SEMI_AUTOMATIC" && overrides.requireCardIdentification === true));

  return {
    tier: input.tier,
    licensedTier,
    effectiveTier,
    capabilities,
    manualEntryPolicy: MANUAL_ENTRY_POLICY[effectiveTier],
    requireCardIdentification,
    issues,
    ready: !issues.some((i) => i.severity === "blocker"),
  };
}

/** Highest tier the installed hardware can support — drives the "upgrade path" hint. */
export function highestSupportedTier(devices: DeviceSummary[]): OperatingTier {
  for (const tier of [...TIERS].reverse()) {
    const resolved = resolveSiteCapabilities({ tier, devices });
    if (resolved.ready) return tier;
  }
  return "MANUAL";
}

export const WORKFLOWS = ["DISPATCH", "RECEIPT", "KNOWN_TARE", "SINGLE"] as const;
export type Workflow = (typeof WORKFLOWS)[number];

export const WORKFLOW_LABEL: Record<Workflow, string> = {
  DISPATCH: "Outbound: tare, load, gross",
  RECEIPT: "Inbound: gross, unload, tare",
  KNOWN_TARE: "Weigh loaded once: use the truck’s stored empty weight",
  SINGLE: "Weigh empty once: capture and store the truck’s empty weight",
};
