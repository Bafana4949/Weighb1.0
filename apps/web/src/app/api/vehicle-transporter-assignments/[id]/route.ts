import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

async function assignment(id: string) { return prisma.vehicleTransporterAssignment.findUnique({ where: { id }, include: { vehicle: true } }); }

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await assignment(id);
  if (!before) return fail("Assignment not found", 404);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  if (!isSuperAdmin && before.vehicle.organisationId !== a.session!.user.organisationId) return fail("Assignment not found", 404);
  const updated = await prisma.vehicleTransporterAssignment.update({ where: { id }, data: { status: "ENDED", validTo: before.validTo ?? new Date() } });
  await audit({ userId: a.session!.user.id, action: "VEHICLE_ASSIGNMENT_ENDED", entityType: "vehicle_transporter_assignment", entityId: id, beforeData: { status: before.status }, afterData: { status: updated.status } });
  return ok(updated);
}
