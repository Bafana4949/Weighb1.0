import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isPlatformSuperAdmin } from "@/lib/permissions";

const schema = z.object({
  role: z.nativeEnum(UserRole),
}).strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid role specification", 422);

  const { id } = await params;
  const actor = access.session!.user;

  // 1. Prevent self-elevation or accidental self-lockout
  if (actor.id === id) {
    return fail("You cannot modify your own role", 400);
  }

  const actorIsSuperAdmin = isPlatformSuperAdmin(actor);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail("User not found", 404);

  // 2. Only platform super-admins can modify platform users
  if (target.platformRole && !actorIsSuperAdmin) {
    return fail("User not found", 404); // 404 to avoid confirming existence
  }

  // 3. Tenant Admin checks
  if (!actorIsSuperAdmin) {
    if (!actor.organisationId || target.organisationId !== actor.organisationId) {
      return fail("User not found", 404); // Cross-tenant isolation
    }
    // Tenant admin cannot promote anyone to ADMIN or modify existing ADMINs
    if (parsed.data.role === UserRole.ADMIN || target.role === UserRole.ADMIN) {
      return fail("Forbidden: Only Platform Super Admin can grant or modify Administrator privileges", 403);
    }
  }

  // 4. Guard against demoting the last platform super-admin
  if (target.platformRole === "PLATFORM_SUPER_ADMIN") {
    const superCount = await prisma.user.count({
      where: { platformRole: "PLATFORM_SUPER_ADMIN" },
    });
    if (superCount <= 1) {
      return fail("Cannot demote the last remaining Platform Super Admin", 400);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
  });

  await audit({
    userId: actor.id,
    action: "USER_ROLE_CHANGED",
    entityType: "user",
    entityId: id,
    beforeData: { role: target.role },
    afterData: { role: updatedUser.role },
  });

  const { passwordHash: _pwd, ...safe } = updatedUser;
  return ok(safe);
}
