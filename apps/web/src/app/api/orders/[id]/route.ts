import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite } from "@/lib/site-access";
import { orderReferenceError, productName as lookupProductName } from "@/lib/order-refs";
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

async function scoped(id: string, user: { id: string; role: UserRole; organisationId: string | null; platformRole?: any }) {
  const row = await prisma.weighbridgeOrder.findUnique({
    where: { id },
    include: includeAll,
  });
  if (!row) return null;

  // Transporter viewing: must have a booking on this order, and sees only its own bookings.
  if (user.role === "TRANSPORTER") {
    if (!user.organisationId) return null;
    const own = row.bookings.filter((b) => b.transporterOrganisationId === user.organisationId);
    return own.length ? { ...row, bookings: own } : null;
  }

  // Staff: the order's weighbridge site must be one the user may access.
  return (await canAccessSite(user, row.site)) ? row : null;
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
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (a.error) return a.error;
  const { id } = await params;
  const before = await scoped(id, a.session!.user);
  if (!before) return fail("Order not found", 404);

  const parsed = orderBaseSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid order update", 422);

  // Operators may pause and resume orders; everything else is an admin decision.
  if (a.session!.user.role === "OPERATOR") {
    const keys = Object.keys(parsed.data);
    if (keys.some((k) => k !== "status") || !["PAUSED", "ACTIVE"].includes(parsed.data.status ?? "")) {
      return fail("Operators can only pause or resume orders", 403);
    }
  }
  const refError = await orderReferenceError(parsed.data, before.site.organisationId);
  if (refError) return fail(refError, 422);

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
  const name = await lookupProductName(parsed.data.productId);
  if (name) parsed.data.product = name;
  const updated = await prisma.weighbridgeOrder.update({
    where: { id },
    data: parsed.data as Prisma.WeighbridgeOrderUncheckedUpdateInput,
    include: includeAll,
  });
  const synced = await syncOrderFulfillmentStatus(id);
  const finalOrder = (synced && synced.status !== updated.status)
    ? (await prisma.weighbridgeOrder.findUnique({ where: { id }, include: includeAll })) ?? updated
    : updated;

  const auditAction = parsed.data.status === "PAUSED"
    ? "ORDER_PAUSED"
    : parsed.data.status === "ACTIVE" && before.status === "PAUSED"
      ? "ORDER_RESUMED"
      : "ORDER_UPDATED";

  await audit({
    ...auditActor(a.session!.user),
    siteId: before.siteId,
    action: auditAction,
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
    ...auditActor(a.session!.user),
    siteId: before.siteId,
    action: "ORDER_CANCELLED",
    entityType: "weighbridge_order",
    entityId: id,
    beforeData: { status: before.status },
    afterData: { status: updated.status },
  });
  return ok(updated);
}
