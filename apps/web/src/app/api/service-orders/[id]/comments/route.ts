import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { routeNotification } from "@/lib/notifications";
import { safeUserSelect } from "@/lib/utils";
import { serviceOrderCommentSchema } from "@/lib/validation";

function inScope(row: { organisationId: string }, callerOrg: string | null) { return !callerOrg || row.organisationId === callerOrg; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const { id } = await params;
  const order = await prisma.serviceOrder.findUnique({ where: { id } });
  if (!order || !inScope(order, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const parsed = serviceOrderCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid comment", 422);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const comment = await prisma.serviceOrderComment.create({
    data: { serviceOrderId: id, authorId: a.session!.user.id, body: parsed.data.body, isInternal: isSuperAdmin ? Boolean(parsed.data.isInternal) : false },
    include: { author: { select: safeUserSelect } },
  });
  await audit({ userId: a.session!.user.id, siteId: order.siteId, action: "SERVICE_ORDER_COMMENTED", entityType: "service_order", entityId: id, afterData: { commentId: comment.id, isInternal: comment.isInternal } });
  if (!comment.isInternal) {
    await routeNotification({ event: "SERVICE_ORDER_COMMENT_ADDED", severity: "LOW", subject: `New comment on ${order.orderNumber}`, body: parsed.data.body.slice(0, 200), organisationId: order.organisationId, metadata: { service_order_id: id } });
  }
  return ok(comment, 201);
}
