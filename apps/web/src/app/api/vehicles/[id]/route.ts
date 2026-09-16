import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { normalisePlate } from "@/lib/utils";
import { vehicleSchema } from "@/lib/validation";
import { isPlatformSuperAdmin } from "@/lib/permissions";

async function allowed(
  id: string,
  session: { user: { id: string; role: UserRole; organisationId: string | null; platformRole?: any } },
  requireWrite = false
) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { organisation: true, trailers: true },
  });
  if (!vehicle) return null;

  if (isPlatformSuperAdmin(session.user)) return vehicle;

  // Non-super-admin must have an organisation
  if (!session.user.organisationId) return null;

  // If modifying/deleting, must belong strictly to user's organisation
  if (requireWrite) {
    if (vehicle.organisationId !== session.user.organisationId) return null;
    return vehicle;
  }

  // Transporter viewing: must be own vehicle
  if (session.user.role === "TRANSPORTER") {
    if (vehicle.organisationId !== session.user.organisationId) return null;
    return vehicle;
  }

  // Site Admin / Operator viewing: vehicle must either belong to own org or have transacted at own site
  if (vehicle.organisationId === session.user.organisationId) return vehicle;

  const hasTransactedAtTenantSite = await prisma.booking.findFirst({
    where: {
      vehicleId: id,
      site: { organisationId: session.user.organisationId },
    },
    select: { id: true },
  });

  return hasTransactedAtTenantSite ? vehicle : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const vehicle = await allowed(id, a.session!, false);
  return vehicle ? ok(vehicle) : fail("Vehicle not found", 404);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const vehicle = await allowed(id, a.session!, true);
  if (!vehicle) return fail("Vehicle not found", 404);

  const parsed = vehicleSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid vehicle update", 422);

  const { organisationId: _ignoredOrganisationId, ...safeUpdate } = parsed.data;
  const data = {
    ...safeUpdate,
    ...(parsed.data.plate
      ? { plate: parsed.data.plate.toUpperCase(), plateNormalized: normalisePlate(parsed.data.plate) }
      : {}),
  };

  return ok(await prisma.vehicle.update({ where: { id }, data }));
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const vehicle = await allowed(id, a.session!, true);
  if (!vehicle) return fail("Vehicle not found", 404);

  const updated = await prisma.vehicle.update({
    where: { id },
    data: { status: "SUSPENDED", deletedAt: new Date() },
  });
  return ok(updated);
}
