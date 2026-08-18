import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { routeNotification } from "@/lib/notifications";
import { vehicleAssignmentSchema } from "@/lib/validation";

async function vehicle(id: string) { return prisma.vehicle.findUnique({ where: { id } }); }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.TRANSPORTER, UserRole.OPERATOR]);
  if (a.error) return a.error;
  const { id } = await params;
  const v = await vehicle(id);
  if (!v) return fail("Vehicle not found", 404);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const callerOrg = a.session!.user.organisationId;
  const isOwnerOrAssigned = isSuperAdmin || v.organisationId === callerOrg || Boolean(await prisma.vehicleTransporterAssignment.findFirst({ where: { vehicleId: id, transporterOrganisationId: callerOrg ?? undefined, status: "ACTIVE" } }));
  if (!isOwnerOrAssigned) return fail("Vehicle not found", 404);
  const assignments = await prisma.vehicleTransporterAssignment.findMany({ where: { vehicleId: id }, include: { transporterOrganisation: true }, orderBy: { createdAt: "desc" } });
  return ok(assignments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const v = await vehicle(id);
  if (!v) return fail("Vehicle not found", 404);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  if (!isSuperAdmin && v.organisationId !== a.session!.user.organisationId) return fail("Vehicle not found", 404);
  const parsed = vehicleAssignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid assignment", 422);
  if (parsed.data.transporterOrganisationId === v.organisationId) return fail("This organisation already owns the vehicle", 422);
  const transporterOrg = await prisma.organisation.findUnique({ where: { id: parsed.data.transporterOrganisationId } });
  if (!transporterOrg) return fail("Transporter organisation not found", 404);
  const existing = await prisma.vehicleTransporterAssignment.findFirst({ where: { vehicleId: id, transporterOrganisationId: parsed.data.transporterOrganisationId, status: "ACTIVE" } });
  if (existing) return fail("An active assignment already exists between this vehicle and transporter", 409);
  const assignment = await prisma.vehicleTransporterAssignment.create({
    data: {
      vehicleId: id, transporterOrganisationId: parsed.data.transporterOrganisationId,
      relationshipType: parsed.data.relationshipType ?? "SUBCONTRACTOR", contractReference: parsed.data.contractReference ?? null,
      notes: parsed.data.notes ?? null, validFrom: parsed.data.validFrom ?? new Date(), validTo: parsed.data.validTo ?? null,
      createdById: a.session!.user.id,
    },
    include: { transporterOrganisation: true },
  });
  await audit({ userId: a.session!.user.id, action: "VEHICLE_ASSIGNMENT_CREATED", entityType: "vehicle_transporter_assignment", entityId: assignment.id, afterData: { vehicleId: id, transporterOrganisationId: parsed.data.transporterOrganisationId, relationshipType: assignment.relationshipType } });
  await routeNotification({ event: "VEHICLE_ASSIGNMENT_CREATED", severity: "LOW", subject: `Vehicle ${v.plate} assigned to ${transporterOrg.name}`, body: `${transporterOrg.name} can now book ${v.plate} as an authorised subcontractor.`, organisationId: parsed.data.transporterOrganisationId, metadata: { vehicle_id: id, assignment_id: assignment.id } });
  return ok(assignment, 201);
}
