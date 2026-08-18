import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id, assignmentId } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (!isPlatformSuperAdmin(a.session!.user) && target.organisationId !== a.session!.user.organisationId)) return fail("User not found", 404);
  const assignment = await prisma.userRoleAssignment.findFirst({ where: { id: assignmentId, userId: id } });
  if (!assignment) return fail("Role assignment not found", 404);
  await prisma.userRoleAssignment.delete({ where: { id: assignmentId } });
  await audit({ userId: a.session!.user.id, action: "ROLE_UNASSIGNED", entityType: "user", entityId: id, beforeData: { roleId: assignment.roleId, siteId: assignment.siteId } });
  return ok({ id: assignmentId, deleted: true });
}
