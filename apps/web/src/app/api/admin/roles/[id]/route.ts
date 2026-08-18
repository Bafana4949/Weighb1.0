import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const roleUpdateSchema = z.object({ name: z.string().min(2).max(60).optional(), permissionKeys: z.array(z.string()).min(1).max(60).optional() });

async function role(id: string) { return prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } }); }
function inScope(row: { organisationId: string | null }, callerOrg: string | null, isSuperAdmin: boolean) { return isSuperAdmin || row.organisationId === callerOrg; }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await role(id);
  if (!before || !inScope(before, a.session!.user.organisationId, isPlatformSuperAdmin(a.session!.user))) return fail("Role not found", 404);
  if (before.isBuiltIn) return fail("Built-in roles cannot be modified", 403);
  const parsed = roleUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid update", 422);
  if (parsed.data.permissionKeys) {
    const permissions = await prisma.permission.findMany({ where: { key: { in: parsed.data.permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id })) });
  }
  const updated = await prisma.role.update({ where: { id }, data: { ...(parsed.data.name ? { name: parsed.data.name } : {}) }, include: { permissions: { include: { permission: true } } } });
  await audit({ userId: a.session!.user.id, action: "ROLE_UPDATED", entityType: "role", entityId: id, beforeData: { name: before.name }, afterData: { name: updated.name, permissionKeys: updated.permissions.map((p) => p.permission.key) } });
  return ok(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await role(id);
  if (!before || !inScope(before, a.session!.user.organisationId, isPlatformSuperAdmin(a.session!.user))) return fail("Role not found", 404);
  if (before.isBuiltIn) return fail("Built-in roles cannot be deleted", 403);
  const assignmentCount = await prisma.userRoleAssignment.count({ where: { roleId: id } });
  if (assignmentCount > 0) return fail("Cannot delete a role that is still assigned to users — unassign it first", 409);
  await prisma.role.delete({ where: { id } });
  await audit({ userId: a.session!.user.id, action: "ROLE_DELETED", entityType: "role", entityId: id, beforeData: { name: before.name } });
  return ok({ id, deleted: true });
}
