import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { audit } from "@/lib/audit";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { UserRole } from "@prisma/client";

export async function GET(request: Request) {
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  const where = {
    ...mineScope(access.session!.user.organisationId),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } }
      ]
    } : {})
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" }
  });

  return ok(products);
}

const createSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unitOfMeasure: z.string().default("TONNE"),
  minimumAllowedWeight: z.number().int().optional().nullable(),
  maximumAllowedWeight: z.number().int().optional().nullable(),
  isActive: z.boolean().default(true)
});

export async function POST(request: Request) {
  const limited = rateLimitOrFail(request, "admin-products-create", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const orgId = access.session!.user.organisationId;
  if (!orgId) return fail("Must belong to a client organisation to create products", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data", 422);

  if (parsed.data.code) {
    const existing = await prisma.product.findFirst({ where: { organisationId: orgId, code: parsed.data.code } });
    if (existing) return fail("Product code already exists", 409);
  }

  const product = await prisma.product.create({
    data: {
      organisationId: orgId,
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      category: parsed.data.category,
      unitOfMeasure: parsed.data.unitOfMeasure,
      minimumAllowedWeight: parsed.data.minimumAllowedWeight,
      maximumAllowedWeight: parsed.data.maximumAllowedWeight,
      isActive: parsed.data.isActive,
      createdByUserId: access.session!.user.id,
    }
  });

  await audit({
    userId: access.session!.user.id,
    action: "PRODUCT_CREATED",
    entityType: "product",
    entityId: product.id,
    afterData: product as any
  });

  return ok(product, 201);
}
