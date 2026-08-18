import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { audit } from "@/lib/audit";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { UserRole } from "@prisma/client";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const destination = await prisma.destination.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) }
  });
  if (!destination) return fail("Not found", 404);

  return ok(destination);
}

const updateSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  isActive: z.boolean()
});

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limited = rateLimitOrFail(request, "admin-destinations-update", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const destination = await prisma.destination.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) }
  });
  if (!destination) return fail("Not found", 404);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data", 422);

  if (parsed.data.code && parsed.data.code !== destination.code) {
    const existing = await prisma.destination.findFirst({ where: { organisationId: destination.organisationId, code: parsed.data.code } });
    if (existing) return fail("Destination code already exists", 409);
  }

  const updated = await prisma.destination.update({
    where: { id: destination.id },
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      address: parsed.data.address,
      contactPerson: parsed.data.contactPerson,
      contactPhone: parsed.data.contactPhone,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      isActive: parsed.data.isActive,
    }
  });

  await audit({
    userId: access.session!.user.id,
    action: "DESTINATION_UPDATED",
    entityType: "destination",
    entityId: updated.id,
    beforeData: destination as any,
    afterData: updated as any
  });

  return ok(updated);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const destination = await prisma.destination.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) },
    include: { _count: { select: { orders: true } } }
  });
  if (!destination) return fail("Not found", 404);

  if (destination._count.orders > 0) {
    return fail("Cannot delete destination because it has associated orders.", 409);
  }

  await prisma.destination.delete({ where: { id: destination.id } });

  await audit({
    userId: access.session!.user.id,
    action: "DESTINATION_DELETED",
    entityType: "destination",
    entityId: destination.id,
    beforeData: destination as any
  });

  return ok({ success: true });
}
