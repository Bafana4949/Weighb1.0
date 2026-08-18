import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const siteAccessSchema = z.object({ siteId: z.string().uuid() });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!isPlatformSuperAdmin(a.session!.user) && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const access = await prisma.userSiteAccess.findMany({ where: { userId: id }, include: { site: true } });
  return ok(access);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!isPlatformSuperAdmin(a.session!.user) && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const parsed = siteAccessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid site access", 422);
  const site = await prisma.site.findFirst({ where: { id: parsed.data.siteId, organisationId: target.organisationId ?? undefined } });
  if (!site) return fail("Site does not belong to this user's organisation", 422);
  try {
    const access = await prisma.userSiteAccess.create({ data: { userId: id, siteId: parsed.data.siteId }, include: { site: true } });
    await audit({ userId: a.session!.user.id, action: "USER_SITE_ACCESS_GRANTED", entityType: "user", entityId: id, afterData: { siteId: parsed.data.siteId } });
    return ok(access, 201);
  } catch {
    return fail("This user already has access to this site", 409);
  }
}
