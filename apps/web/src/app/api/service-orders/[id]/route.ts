import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { routeNotification } from "@/lib/notifications";
import { safeUserSelect } from "@/lib/utils";
import { serviceOrderUpdateSchema } from "@/lib/validation";

async function order(id: string) {
  return prisma.serviceOrder.findUnique({ where: { id }, include: { organisation: true, site: true, createdBy: { select: safeUserSelect }, assignedTo: { select: safeUserSelect } } });
}
function inScope(row: { organisationId: string }, callerOrg: string | null) { return !callerOrg || row.organisationId === callerOrg; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const { id } = await params;
  const row = await order(id);
  if (!row || !inScope(row, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const comments = await prisma.serviceOrderComment.findMany({ where: { serviceOrderId: id, ...(isSuperAdmin ? {} : { isInternal: false }) }, include: { author: { select: safeUserSelect } }, orderBy: { createdAt: "asc" } });
  return ok({ ...row, comments });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await order(id);
  if (!before || !inScope(before, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const parsed = serviceOrderUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid update", 422);
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: parsed.data.assignedToId } });
    if (!assignee) return fail("Assignee not found", 404);
  }
  const now = new Date();
  const statusTimestamps: Record<string, Date> = {};
  if (parsed.data.status && parsed.data.status !== before.status) {
    if (parsed.data.status === "ACKNOWLEDGED" && !before.acknowledgedAt) statusTimestamps.acknowledgedAt = now;
    if (parsed.data.status === "IN_PROGRESS" && !before.startedAt) statusTimestamps.startedAt = now;
    if (parsed.data.status === "RESOLVED") statusTimestamps.resolvedAt = now;
    if (parsed.data.status === "CLOSED") statusTimestamps.closedAt = now;
  }
  const updated = await prisma.serviceOrder.update({ where: { id }, data: { ...parsed.data, ...statusTimestamps }, include: { organisation: true, site: true, createdBy: { select: safeUserSelect }, assignedTo: { select: safeUserSelect } } });
  await audit({ userId: a.session!.user.id, siteId: before.siteId, action: "SERVICE_ORDER_UPDATED", entityType: "service_order", entityId: id, beforeData: { status: before.status, priority: before.priority, assignedToId: before.assignedToId }, afterData: { status: updated.status, priority: updated.priority, assignedToId: updated.assignedToId } });
  if (parsed.data.assignedToId && parsed.data.assignedToId !== before.assignedToId) {
    await routeNotification({ event: "SERVICE_ORDER_ASSIGNED", severity: "LOW", subject: `Service order ${updated.orderNumber} assigned`, body: updated.title, organisationId: updated.organisationId, metadata: { service_order_id: id } });
  }
  if (parsed.data.status === "RESOLVED" && before.status !== "RESOLVED") {
    await routeNotification({ event: "SERVICE_ORDER_RESOLVED", severity: "LOW", subject: `Service order ${updated.orderNumber} resolved`, body: updated.resolutionNotes ?? updated.title, organisationId: updated.organisationId, metadata: { service_order_id: id } });
  }
  return ok(updated);
}
