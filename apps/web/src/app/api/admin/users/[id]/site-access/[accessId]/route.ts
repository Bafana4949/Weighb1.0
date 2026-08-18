import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; accessId: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id, accessId } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!isPlatformSuperAdmin(a.session!.user) && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const access = await prisma.userSiteAccess.findFirst({ where: { id: accessId, userId: id } });
  if (!access) return fail("Site access not found", 404);
  await prisma.userSiteAccess.delete({ where: { id: accessId } });
  await audit({ userId: a.session!.user.id, action: "USER_SITE_ACCESS_REVOKED", entityType: "user", entityId: id, beforeData: { siteId: access.siteId } });
  return ok({ id: accessId, deleted: true });
}
