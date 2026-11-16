import { z } from "zod";
import { OperatingTier, UserRole, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { BUILT_IN_PROFILES } from "@/lib/hardware-profiles";

/** Built-in templates plus templates saved by the platform (global) or for a company. */
export async function GET() {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const orgId = a.session!.user.organisationId;
  const saved = await prisma.hardwareProfile.findMany({
    where: orgId ? { OR: [{ organisationId: null }, { organisationId: orgId }] } : {},
    include: { organisation: { select: { name: true } } },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });
  return ok([...BUILT_IN_PROFILES, ...saved.map((p) => ({ ...p, builtIn: false }))]);
}

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional(),
  tier: z.nativeEnum(OperatingTier),
  fromSiteId: z.string().uuid(),
  organisationId: z.string().uuid().nullable().optional(),
});

/** Saves a site's current devices as a reusable template (settings copied, serials/addresses stripped). */
export async function POST(request: Request) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid template", 422);
  const devices = await prisma.hardwareDevice.findMany({ where: { siteId: parsed.data.fromSiteId, isActive: true }, include: { lane: { select: { laneNumber: true } } } });
  if (!devices.length) return fail("That site has no active devices to save", 422);
  const strip = new Set(["host", "comPort", "managementIp", "hostname", "credentialRef"]);
  const profileDevices = devices.map((d) => ({
    type: d.type,
    deviceKey: d.deviceKey,
    name: d.name,
    laneNumber: d.lane?.laneNumber ?? null,
    connectionType: d.connectionType ?? "NONE",
    configuration: Object.fromEntries(Object.entries((d.configuration as Record<string, unknown>) ?? {}).filter(([k]) => !strip.has(k))),
  }));
  try {
    const profile = await prisma.hardwareProfile.create({
      data: { name: parsed.data.name, description: parsed.data.description ?? null, tier: parsed.data.tier, organisationId: parsed.data.organisationId ?? null, devices: profileDevices as Prisma.InputJsonValue, createdById: a.session!.user.id },
    });
    await audit({ ...auditActor(a.session!.user), organisationId: parsed.data.organisationId ?? null, action: "HARDWARE_PROFILE_SAVED", entityType: "hardware_profile", entityId: profile.id, afterData: { name: profile.name, devices: profileDevices.length } });
    return ok(profile, 201);
  } catch {
    return fail("A template with this name already exists", 409);
  }
}
