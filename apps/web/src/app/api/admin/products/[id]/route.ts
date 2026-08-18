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

  const product = await prisma.product.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) }
  });
  if (!product) return fail("Not found", 404);

  return ok(product);
}

const updateSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unitOfMeasure: z.string().default("TONNE"),
  minimumAllowedWeight: z.number().int().optional().nullable(),
  maximumAllowedWeight: z.number().int().optional().nullable(),
  isActive: z.boolean()
});

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limited = rateLimitOrFail(request, "admin-products-update", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const product = await prisma.product.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) }
  });
  if (!product) return fail("Not found", 404);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data", 422);

  if (parsed.data.code && parsed.data.code !== product.code) {
    const existing = await prisma.product.findFirst({ where: { organisationId: product.organisationId, code: parsed.data.code } });
    if (existing) return fail("Product code already exists", 409);
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      category: parsed.data.category,
      unitOfMeasure: parsed.data.unitOfMeasure,
      minimumAllowedWeight: parsed.data.minimumAllowedWeight,
      maximumAllowedWeight: parsed.data.maximumAllowedWeight,
      isActive: parsed.data.isActive,
    }
  });

  await audit({
    userId: access.session!.user.id,
    action: "PRODUCT_UPDATED",
    entityType: "product",
    entityId: updated.id,
    beforeData: product as any,
    afterData: updated as any
  });

  return ok(updated);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const product = await prisma.product.findFirst({
    where: { id: params.id, ...mineScope(access.session!.user.organisationId) },
    include: { _count: { select: { orders: true } } }
  });
  if (!product) return fail("Not found", 404);

  if (product._count.orders > 0) {
    return fail("Cannot delete product because it has associated orders.", 409);
  }

  await prisma.product.delete({ where: { id: product.id } });

  await audit({
    userId: access.session!.user.id,
    action: "PRODUCT_DELETED",
    entityType: "product",
    entityId: product.id,
    beforeData: product as any
  });

  return ok({ success: true });
}
