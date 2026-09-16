import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";

function canAccessBooking(
  booking: { transporterOrganisationId: string; site: { organisationId: string } },
  user: { role: UserRole; organisationId: string | null; platformRole?: any }
): boolean {
  if (isPlatformSuperAdmin(user)) return true;
  if (!user.organisationId) return false;
  if (user.role === "TRANSPORTER") {
    return booking.transporterOrganisationId === user.organisationId;
  }
  return booking.site.organisationId === user.organisationId;
}

export const GET = withScopeErrors(async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const row = await prisma.booking.findUnique({
    where: { id },
    include: { vehicle: true, driver: true, site: true, trailer: true, transactions: true },
  });
  if (!row || !canAccessBooking(row, a.session!.user)) return fail("Booking not found", 404);
  return ok(row);
});

export const DELETE = withScopeErrors(async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const row = await prisma.booking.findUnique({
    where: { id },
    include: { site: true },
  });
  if (!row || !canAccessBooking(row, a.session!.user)) return fail("Booking not found", 404);
  if (row.status !== "PENDING") return fail("Only pending bookings can be cancelled", 409);
  return ok(await prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } }));
});
