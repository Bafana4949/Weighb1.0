import { z } from "zod";
import { OperatingTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { siteSchema } from "@/lib/validation";
import { BUILT_IN_PROFILES, type ProfileDevice } from "@/lib/hardware-profiles";
import { applyProfile } from "@/lib/hardware-service";
import { TIER_LABEL, WORKFLOWS, tierRank } from "@/lib/tiers";

const schema = siteSchema.extend({
  operatingTier: z.nativeEnum(OperatingTier),
  laneCount: z.number().int().min(1).max(8),
  profileId: z.string().optional().nullable(),
  allowedWorkflows: z.array(z.enum(WORKFLOWS)).min(1),
});

/**
 * Site setup wizard: creates the site INACTIVE with its lanes, tier, workflows and an
 * optional hardware template in one step. The site is activated separately, once its
 * readiness checks pass.
 */
export async function POST(request: Request) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid site", 422);
  const { operatingTier, laneCount, profileId, allowedWorkflows, operatingStart, operatingEnd, ...siteData } = parsed.data;

  const company = await prisma.organisation.findFirst({ where: { id: siteData.organisationId, type: "MINING_COMPANY", deletedAt: null } });
  if (!company) return fail("Company not found", 404);
  if (tierRank(operatingTier) > tierRank(company.licensedTier)) {
    return fail(`${company.name} is licensed up to ${TIER_LABEL[company.licensedTier]}. Upgrade the licence first.`, 422);
  }
  const code = siteData.code.toUpperCase();
  if (await prisma.site.findUnique({ where: { code } })) return fail(`Site code ${code} is already in use`, 409);
  const builtIn = profileId ? BUILT_IN_PROFILES.find((p) => p.id === profileId) : null;
  const saved = profileId && !builtIn ? await prisma.hardwareProfile.findFirst({ where: { id: profileId, OR: [{ organisationId: null }, { organisationId: company.id }] } }) : null;
  if (profileId && !builtIn && !saved) return fail("Hardware template not found", 404);

  const site = await prisma.site.create({
    data: {
      ...siteData,
      code,
      operatingTier,
      isActive: false,
      config: { create: { allowedWorkflows, ...(operatingStart ? { operatingStart } : {}), ...(operatingEnd ? { operatingEnd } : {}) } },
      lanes: {
        create: Array.from({ length: laneCount }, (_, i) => ({
          laneNumber: i + 1,
          name: siteData.topology === "DUAL_ENTRY_EXIT" ? (i % 2 === 0 ? `Entry lane ${Math.floor(i / 2) + 1}` : `Exit lane ${Math.floor(i / 2) + 1}`) : `Weighbridge ${i + 1}`,
          direction: siteData.topology === "DUAL_ENTRY_EXIT" ? (i % 2 === 0 ? "ENTRY" : "EXIT") : null,
        })),
      },
    },
  });
  const devices = (builtIn?.devices ?? (saved?.devices as unknown as ProfileDevice[] | undefined)) ?? [];
  const hardware = devices.length ? await applyProfile(site.id, devices) : { created: 0, skipped: 0, errors: [] as string[] };
  await audit({ ...auditActor(a.session!.user), siteId: site.id, organisationId: company.id, action: "SITE_CREATED", entityType: "site", entityId: site.id, afterData: { code, name: site.name, operatingTier, laneCount, profile: builtIn?.name ?? saved?.name ?? null, devices: hardware.created } });
  return ok({ site: { id: site.id, code: site.code, name: site.name }, hardware }, 201);
}
