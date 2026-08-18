import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const assignSchema = z.object({ roleId: z.string().uuid(), siteId: z.string().uuid().optional().nullable() });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!isPlatformSuperAdmin(a.session!.user) && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const assignments = await prisma.userRoleAssignment.findMany({ where: { userId: id }, include: { role: true, site: true } });
  return ok(assignments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  if (!target || (!isSuperAdmin && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid role assignment", 422);
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return fail("Role not found", 404);
  if (role.organisationId !== null && role.organisationId !== target.organisationId) return fail("This role does not belong to the user's organisation", 422);
  if (parsed.data.siteId) {
    const site = await prisma.site.findFirst({ where: { id: parsed.data.siteId, organisationId: target.organisationId ?? undefined } });
    if (!site) return fail("Site does not belong to this user's organisation", 422);
  }
  try {
    const assignment = await prisma.userRoleAssignment.create({ data: { userId: id, roleId: parsed.data.roleId, siteId: parsed.data.siteId ?? null }, include: { role: true, site: true } });
    await audit({ userId: a.session!.user.id, action: "ROLE_ASSIGNED", entityType: "user", entityId: id, afterData: { roleId: parsed.data.roleId, roleName: role.name, siteId: parsed.data.siteId ?? null } });
    return ok(assignment, 201);
  } catch {
    return fail("This role is already assigned to this user for this site", 409);
  }
}
