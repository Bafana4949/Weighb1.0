import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const roleSchema = z.object({
  name: z.string().min(2).max(60),
  organisationId: z.string().uuid().optional(),
  permissionKeys: z.array(z.string()).min(1).max(60),
});

export async function GET(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const url = new URL(request.url);
  const orgFilter = url.searchParams.get("organisationId");
  const roles = await prisma.role.findMany({
    where: { OR: [{ organisationId: null }, isSuperAdmin ? (orgFilter ? { organisationId: orgFilter } : {}) : { organisationId: a.session!.user.organisationId }] },
    include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true } } },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
  });
  return ok(roles);
}

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid role", 422);
  const organisationId = isSuperAdmin ? (parsed.data.organisationId ?? null) : a.session!.user.organisationId;
  if (!isSuperAdmin && !organisationId) return fail("User is not linked to an organisation", 422);
  if (!isSuperAdmin && parsed.data.organisationId && parsed.data.organisationId !== organisationId) return fail("You can only create roles for your own organisation", 403);
  const permissions = await prisma.permission.findMany({ where: { key: { in: parsed.data.permissionKeys } } });
  if (!permissions.length) return fail("At least one valid permission is required", 422);
  try {
    const role = await prisma.role.create({
      data: { name: parsed.data.name, organisationId, isBuiltIn: false, permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } },
      include: { permissions: { include: { permission: true } } },
    });
    await audit({ userId: a.session!.user.id, action: "ROLE_CREATED", entityType: "role", entityId: role.id, afterData: { name: role.name, organisationId, permissionKeys: permissions.map((p) => p.key) } });
    return ok(role, 201);
  } catch (error) {
    console.error("Role creation error:", error);
    return fail("A role with that name already exists for this organisation", 409);
  }
}
