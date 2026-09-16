import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { siteIdentifierWhere } from "@/lib/utils";
import { siteSchema } from "@/lib/validation";

async function site(id: string) {
  return prisma.site.findFirst({
    where: siteIdentifierWhere(id),
    include: { organisation: true, config: true, hardwareDevices: { where: { isActive: true } } },
  });
}

function userHasSiteAccess(siteRow: { organisationId: string }, user: { role?: UserRole | null; organisationId?: string | null; platformRole?: any }): boolean {
  if (isPlatformSuperAdmin(user)) return true;
  if (!user.organisationId) return false;
  return siteRow.organisationId === user.organisationId;
}

export const GET = withScopeErrors(async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const row = await site(id);
  if (!row) return fail("Site not found", 404);
  
  if (a.session!.user.role === "TRANSPORTER") {
    // Transporters only allowed if they have bookings at this site
    const hasBooking = await prisma.booking.count({
      where: { siteId: row.id, transporterOrganisationId: a.session!.user.organisationId! },
    });
    if (!hasBooking && !isPlatformSuperAdmin(a.session!.user)) {
      return fail("Site not found", 404);
    }
  } else if (!userHasSiteAccess(row, a.session!.user)) {
    return fail("Site not found", 404);
  }

  return ok(row);
});

export const PUT = withScopeErrors(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await site(id);
  if (!before || !userHasSiteAccess(before, a.session!.user)) return fail("Site not found", 404);

  const parsed = siteSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid site update", 422);

  const { operatingStart, operatingEnd, code, organisationId, ...rest } = parsed.data;
  const updated = await prisma.site.update({
    where: { id: before.id },
    data: { ...rest, ...(code ? { code: code.toUpperCase() } : {}) },
    include: { organisation: true, config: true },
  });

  if (operatingStart || operatingEnd) {
    await prisma.siteConfig.upsert({
      where: { siteId: before.id },
      create: { siteId: before.id, ...(operatingStart ? { operatingStart } : {}), ...(operatingEnd ? { operatingEnd } : {}) },
      update: { ...(operatingStart ? { operatingStart } : {}), ...(operatingEnd ? { operatingEnd } : {}) },
    });
  }

  await audit({
    userId: a.session!.user.id,
    siteId: before.id,
    action: "SITE_UPDATED",
    entityType: "site",
    entityId: before.id,
    beforeData: before,
    afterData: updated,
  });

  return ok(await site(before.id));
});

export const DELETE = withScopeErrors(async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await site(id);
  if (!before || !userHasSiteAccess(before, a.session!.user)) return fail("Site not found", 404);

  const updated = await prisma.site.update({
    where: { id: before.id },
    data: { isActive: false },
  });

  await audit({
    userId: a.session!.user.id,
    siteId: before.id,
    action: "SITE_DEACTIVATED",
    entityType: "site",
    entityId: before.id,
    beforeData: { isActive: before.isActive },
    afterData: { isActive: updated.isActive },
  });

  return ok(updated);
});
