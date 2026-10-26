import { prisma } from "@/lib/prisma";
import { resolveSiteCapabilities, type ResolvedSiteCapabilities } from "@/lib/tiers";

/** Effective capabilities of a site from its tier, company licence, devices and overrides. */
export async function loadSiteCapabilities(siteId: string): Promise<ResolvedSiteCapabilities | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      operatingTier: true,
      featureOverrides: true,
      organisation: { select: { licensedTier: true } },
      hardwareDevices: { select: { type: true, isActive: true, maintenanceMode: true } },
    },
  });
  if (!site) return null;
  return resolveSiteCapabilities({
    tier: site.operatingTier,
    licensedTier: site.organisation.licensedTier,
    devices: site.hardwareDevices,
    overrides: site.featureOverrides,
  });
}

export type WeightSource = "INDICATOR" | "MANUAL";

/**
 * Applies the tier's manual-entry policy to one captured weight. Manual sites type
 * weights as normal; Semi-Automatic needs a reason; Fully Automatic also needs the
 * transaction.override permission. Returns an error message or null.
 */
export function manualEntryError(
  caps: ResolvedSiteCapabilities,
  source: WeightSource,
  reason: string | null | undefined,
  hasOverridePermission: boolean,
): string | null {
  if (source === "INDICATOR" || caps.manualEntryPolicy === "PRIMARY") return null;
  if (!reason || reason.trim().length < 5) return "This site reads weights from the indicator. Give a reason (at least 5 characters) to enter a weight by hand.";
  if (caps.manualEntryPolicy === "SUPERVISOR_OVERRIDE" && !hasOverridePermission) {
    return "Typed weights at a fully automatic site need a supervisor (transaction.override permission).";
  }
  return null;
}
