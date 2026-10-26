import { prisma } from "@/lib/prisma";
import { fail, ok, requirePlatformSuperAdmin } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { generateEdgeKey } from "@/lib/edge-auth";

/**
 * Issues (or rotates) the site's edge controller key. The plain key is returned exactly
 * once; only its hash is stored. Rotating immediately invalidates the previous key.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true, code: true, edgeKeyHash: true } });
  if (!site) return fail("Site not found", 404);
  const { key, hash, prefix } = generateEdgeKey();
  await prisma.site.update({ where: { id }, data: { edgeKeyHash: hash, edgeKeyPrefix: prefix, edgeKeyIssuedAt: new Date() } });
  await audit({ ...auditActor(a.session!.user), siteId: id, action: site.edgeKeyHash ? "EDGE_KEY_ROTATED" : "EDGE_KEY_ISSUED", entityType: "site", entityId: id, afterData: { prefix } });
  return ok({ key, prefix, siteCode: site.code, note: "Copy this key into the edge controller now (WB_SITE_API_KEY). It will not be shown again." }, 201);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformSuperAdmin();
  if (a.error) return a.error;
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true, edgeKeyPrefix: true } });
  if (!site) return fail("Site not found", 404);
  await prisma.site.update({ where: { id }, data: { edgeKeyHash: null, edgeKeyPrefix: null, edgeKeyIssuedAt: null } });
  await audit({ ...auditActor(a.session!.user), siteId: id, action: "EDGE_KEY_REVOKED", entityType: "site", entityId: id, beforeData: { prefix: site.edgeKeyPrefix } });
  return ok({ revoked: true });
}
