import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { driverSchema } from "@/lib/validation";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";

function canAccessDriver(driver: { organisationId: string }, user: { role: UserRole; organisationId: string | null; platformRole?: any }): boolean {
  if (isPlatformSuperAdmin(user)) return true;
  if (!user.organisationId) return false;
  return driver.organisationId === user.organisationId;
}

export const GET = withScopeErrors(async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver || !canAccessDriver(driver, a.session!.user)) return fail("Driver not found", 404);
  const { idNumberEncrypted, idNumberHash, ...safe } = driver;
  return ok(safe);
});

export const PUT = withScopeErrors(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver || !canAccessDriver(driver, a.session!.user)) return fail("Driver not found", 404);

  const parsed = driverSchema.omit({ idNumber: true, consent: true }).partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid driver update", 422);

  const { organisationId: _ignoredOrganisationId, ...data } = parsed.data;
  const updated = await prisma.driver.update({ where: { id }, data });
  const { idNumberEncrypted, idNumberHash, ...safe } = updated;
  return ok(safe);
});

export const DELETE = withScopeErrors(async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver || !canAccessDriver(driver, a.session!.user)) return fail("Driver not found", 404);

  const updated = await prisma.driver.update({ where: { id }, data: { deletedAt: new Date() } });
  const { idNumberEncrypted, idNumberHash, ...safe } = updated;
  return ok(safe);
});
