import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { trailerSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const vehicleId = url.searchParams.get("vehicleId");
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const org = isSuperAdmin ? url.searchParams.get("org") : a.session!.user.organisationId;
  const trailers = await prisma.trailer.findMany({
    where: {
      ...(vehicleId ? { vehicleId } : {}),
      ...(org ? { vehicle: { organisationId: org } } : {}),
    },
    include: { vehicle: true },
    orderBy: { trailerId: "asc" },
  });
  return ok(trailers);
}

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const parsed = trailerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid trailer", 422);
  const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
  if (!vehicle) return fail("Vehicle not found", 404);

  if (!isPlatformSuperAdmin(a.session!.user) && a.session!.user.organisationId && vehicle.organisationId !== a.session!.user.organisationId) {
    return fail("Forbidden: Trailer can only be assigned to a vehicle belonging to your organisation", 403);
  }

  try {
    const trailer = await prisma.trailer.create({ data: parsed.data });
    return ok(trailer, 201);
  } catch {
    return fail("Trailer ID or registration number is already registered", 409);
  }
}
