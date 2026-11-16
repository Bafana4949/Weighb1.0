import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { loadSiteCapabilities } from "@/lib/site-capabilities";

/** Activates a site only when its tier's required hardware is configured. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true, isActive: true, organisation: { select: { status: true } }, _count: { select: { lanes: true } } } });
  if (!site) return fail("Site not found", 404);
  if (site.organisation.status !== "ACTIVE") return fail("The company is not active", 409);
  if (site._count.lanes === 0) return fail("Add at least one weighbridge lane before activating", 422);
  const caps = await loadSiteCapabilities(id);
  const blockers = caps?.issues.filter((i) => i.severity === "blocker") ?? [];
  if (blockers.length) return fail(`Not ready: ${blockers.map((b) => b.message).join(" ")}`, 422);
  await prisma.site.update({ where: { id }, data: { isActive: true } });
  await audit({ ...auditActor(a.session!.user), siteId: id, action: "SITE_ACTIVATED", entityType: "site", entityId: id, beforeData: { isActive: site.isActive }, afterData: { isActive: true } });
  return ok({ id, isActive: true });
}
