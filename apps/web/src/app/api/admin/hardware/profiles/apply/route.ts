import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { BUILT_IN_PROFILES, type ProfileDevice } from "@/lib/hardware-profiles";
import { applyProfile } from "@/lib/hardware-service";

const schema = z.object({ profileId: z.string().min(1), siteId: z.string().uuid() });

export async function POST(request: Request) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("profileId and siteId are required", 422);
  const site = await prisma.site.findUnique({ where: { id: parsed.data.siteId }, select: { id: true, organisationId: true } });
  if (!site) return fail("Site not found", 404);
  const builtIn = BUILT_IN_PROFILES.find((p) => p.id === parsed.data.profileId);
  const saved = builtIn ? null : await prisma.hardwareProfile.findFirst({ where: { id: parsed.data.profileId, OR: [{ organisationId: null }, { organisationId: site.organisationId }] } });
  if (!builtIn && !saved) return fail("Template not found", 404);
  const devices = (builtIn?.devices ?? (saved!.devices as unknown as ProfileDevice[])) || [];
  const result = await applyProfile(site.id, devices);
  await audit({ ...auditActor(a.session!.user), siteId: site.id, action: "HARDWARE_PROFILE_APPLIED", entityType: "site", entityId: site.id, afterData: { profile: builtIn?.name ?? saved!.name, ...result } });
  return ok(result);
}
