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

  const sources = await prisma.source.findMany({
    where,
    orderBy: { name: "asc" }
  });

  return ok(sources);
}

const createSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  isActive: z.boolean().default(true)
});

export async function POST(request: Request) {
  const limited = rateLimitOrFail(request, "admin-sources-create", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const orgId = access.session!.user.organisationId;
  if (!orgId) return fail("Must belong to a client organisation to create sources", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid data", 422);

  if (parsed.data.code) {
    const existing = await prisma.source.findFirst({ where: { organisationId: orgId, code: parsed.data.code } });
    if (existing) return fail("Source code already exists", 409);
  }

  const source = await prisma.source.create({
    data: {
      organisationId: orgId,
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      address: parsed.data.address,
      contactPerson: parsed.data.contactPerson,
      contactPhone: parsed.data.contactPhone,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      isActive: parsed.data.isActive,
      createdByUserId: access.session!.user.id,
    }
  });

  await audit({
    userId: access.session!.user.id,
    action: "SOURCE_CREATED",
    entityType: "source",
    entityId: source.id,
    afterData: source as any
  });

  return ok(source, 201);
}
