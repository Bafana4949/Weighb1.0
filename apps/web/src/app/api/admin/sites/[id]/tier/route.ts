import { z } from "zod";
import { OperatingTier, UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite } from "@/lib/site-access";
import { CAPABILITY_KEYS, WORKFLOWS, resolveSiteCapabilities, highestSupportedTier, parseOverrides } from "@/lib/tiers";

async function load(id: string) {
  return prisma.site.findUnique({
    where: { id },
    include: {
      organisation: { select: { id: true, name: true, licensedTier: true } },
      config: { select: { allowedWorkflows: true } },
      hardwareDevices: { select: { type: true, isActive: true, maintenanceMode: true } },
    },
  });
}

/** Tier, licence, effective capabilities and readiness issues for one site. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const site = await load(id);
  if (!site || !(await canAccessSite(a.session!.user, site))) return fail("Site not found", 404);
  const resolved = resolveSiteCapabilities({ tier: site.operatingTier, licensedTier: site.organisation.licensedTier, devices: site.hardwareDevices, overrides: site.featureOverrides });
  return ok({
    siteId: site.id,
    ...resolved,
    overrides: parseOverrides(site.featureOverrides),
    allowedWorkflows: site.config?.allowedWorkflows ?? ["DISPATCH", "RECEIPT", "KNOWN_TARE"],
    highestSupportedTier: highestSupportedTier(site.hardwareDevices),
  });
}

const schema = z.object({
  operatingTier: z.nativeEnum(OperatingTier),
  overrides: z.object({
    requireCardIdentification: z.boolean().optional(),
    disabled: z.array(z.enum(CAPABILITY_KEYS as [string, ...string[]])).optional(),
  }).default({}),
  allowedWorkflows: z.array(z.enum(WORKFLOWS)).min(1, "Allow at least one weighing workflow").optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const before = await load(id);
  if (!before) return fail("Site not found", 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid tier settings", 422);
  const resolved = resolveSiteCapabilities({ tier: parsed.data.operatingTier, licensedTier: before.organisation.licensedTier, devices: before.hardwareDevices, overrides: parsed.data.overrides });
  const licenceIssue = resolved.issues.find((i) => i.severity === "blocker" && !i.capability);
  if (licenceIssue) return fail(licenceIssue.message, 422);
  // Hardware gaps don't block saving the tier — they block activation — so a site can be
  // configured before its hardware is commissioned.
  await prisma.$transaction([
    prisma.site.update({ where: { id }, data: { operatingTier: parsed.data.operatingTier, featureOverrides: parsed.data.overrides as Prisma.InputJsonValue } }),
    ...(parsed.data.allowedWorkflows
      ? [prisma.siteConfig.upsert({ where: { siteId: id }, create: { siteId: id, allowedWorkflows: parsed.data.allowedWorkflows }, update: { allowedWorkflows: parsed.data.allowedWorkflows } })]
      : []),
  ]);
  await audit({
    ...auditActor(a.session!.user),
    siteId: id,
    action: "SITE_TIER_UPDATED",
    entityType: "site",
    entityId: id,
    beforeData: { operatingTier: before.operatingTier, overrides: before.featureOverrides, allowedWorkflows: before.config?.allowedWorkflows },
    afterData: parsed.data,
  });
  return ok({ ...resolved, overrides: parsed.data.overrides });
}
