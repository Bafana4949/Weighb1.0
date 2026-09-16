import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { safeUserSelect } from "@/lib/utils";
import { orderBaseSchema } from "@/lib/validation";
import { syncOrderFulfillmentStatus } from "@/lib/order-fulfillment";
import { isPlatformSuperAdmin } from "@/lib/permissions";

const includeAll = {
  site: true,
  originSite: true,
  destinationSite: true,
  source: true,
  destination: true,
  productRef: true,
  createdBy: { select: safeUserSelect },
  bookings: { include: { transactions: true } },
} as const;

async function scoped(id: string, user: { role: UserRole; organisationId: string | null; platformRole?: any }) {
  const row = await prisma.weighbridgeOrder.findUnique({
    where: { id },
    include: includeAll,
  });
  if (!row) return null;

  if (isPlatformSuperAdmin(user)) return row;

  // Non-super-admin must have an organisation
  if (!user.organisationId) return null;

  // Transporter viewing: must be assigned to one of the bookings in this order
  if (user.role === "TRANSPORTER") {
    const isAssigned = row.bookings.some((b) => b.transporterOrganisationId === user.organisationId);
    return isAssigned ? row : null;
  }

  // Tenant admin/operator: order site must belong to user's organisation
  if (row.site.organisationId !== user.organisationId) return null;

  return row;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const order = await scoped(id, a.session!.user);
  if (!order) return fail("Order not found", 404);

  // Redact commercial rate if not platform super-admin or owning tenant admin
  const isSuper = isPlatformSuperAdmin(a.session!.user);
  const isOwningAdmin = a.session!.user.role === "ADMIN" && order.site.organisationId === a.session!.user.organisationId;
  if (!isSuper && !isOwningAdmin) {
    (order as any).ratePerTonZar = null;
  }

  return ok(order);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await scoped(id, a.session!.user);
  if (!before) return fail("Order not found", 404);

  const parsed = orderBaseSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid order update", 422);

  if (parsed.data.orderNumber) {
    const cleanNo = parsed.data.orderNumber.trim();
    const existing = await prisma.weighbridgeOrder.findFirst({
      where: { orderNumber: cleanNo, id: { not: id } },
    });
    if (existing) return fail(`Order number '${cleanNo}' is already taken by another order`, 409);
    parsed.data.orderNumber = cleanNo;
  }

  if (!isPlatformSuperAdmin(a.session!.user)) {
    delete parsed.data.ratePerTonZar;
  }
  if (parsed.data.productId) {
    const prod = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (prod) {
      (parsed.data as any).product = prod.name;
    }
  }
  const updated = await prisma.weighbridgeOrder.update({
    where: { id },
    data: parsed.data as Prisma.WeighbridgeOrderUncheckedUpdateInput,
    include: includeAll,
  });
  const synced = await syncOrderFulfillmentStatus(id);
  const finalOrder = (synced && synced.status !== updated.status)
    ? (await prisma.weighbridgeOrder.findUnique({ where: { id }, include: includeAll })) ?? updated
    : updated;
  await audit({
    userId: a.session!.user.id,
    siteId: before.siteId,
    action: "ORDER_UPDATED",
    entityType: "weighbridge_order",
    entityId: id,
    beforeData: before,
    afterData: finalOrder,
  });
  return ok(finalOrder);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await scoped(id, a.session!.user);
  if (!before) return fail("Order not found", 404);

  const updated = await prisma.weighbridgeOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await audit({
    userId: a.session!.user.id,
    siteId: before.siteId,
    action: "ORDER_CANCELLED",
    entityType: "weighbridge_order",
    entityId: id,
    beforeData: { status: before.status },
    afterData: { status: updated.status },
  });
  return ok(updated);
}
