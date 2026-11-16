import { OrderStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { audit, auditActor } from "@/lib/audit";
import { canAccessSite, loadAccessContext, viaSiteWhere } from "@/lib/site-access";
import { orderReferenceError, productName as lookupProductName } from "@/lib/order-refs";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { safeUserSelect } from "@/lib/utils";
import { orderSchema } from "@/lib/validation";

async function nextOrderNumber() {
  const count = await prisma.weighbridgeOrder.count();
  return `ORD-${String(count + 1).padStart(6, "0")}`;
}

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as OrderStatus | null;
  const site = url.searchParams.get("site");

  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const isTransporter = a.session!.user.role === "TRANSPORTER";

  const transporterOrgId = isTransporter ? a.session!.user.organisationId : null;
  if (isTransporter && !transporterOrgId) return fail("Tenant organisation scope required", 403);
  const scope = isTransporter
    ? { bookings: { some: { transporterOrganisationId: transporterOrgId! } } }
    : viaSiteWhere(await loadAccessContext(a.session!.user));
  const take = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);

  const orders = await prisma.weighbridgeOrder.findMany({
    where: {
      AND: [scope, site ? { siteId: site } : {}],
      ...(status ? { status } : {}),
    },
    include: {
      site: true,
      originSite: true,
      destinationSite: true,
      source: true,
      destination: true,
      productRef: true,
      createdBy: { select: safeUserSelect },
      // Transporters only ever see their own trucks on a shared order.
      bookings: { where: transporterOrgId ? { transporterOrganisationId: transporterOrgId } : undefined, include: { transactions: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  // The commercial rate is visible to the platform and the owning company's admins only.
  const showRate = isSuperAdmin || a.session!.user.role === "ADMIN";
  return ok(showRate ? orders : orders.map((o) => ({ ...o, ratePerTonZar: null })));
});

export const POST = withScopeErrors(async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid order", 422);
  if (a.session!.user.platformRole !== "PLATFORM_SUPER_ADMIN") {
    delete parsed.data.ratePerTonZar;
  }
  const site = await prisma.site.findUnique({ where: { id: parsed.data.siteId } });
  if (!site || !site.isActive) return fail("Weighbridge site is unavailable", 422);
  if (!(await canAccessSite(a.session!.user, site))) return fail("Weighbridge site is unavailable", 422);
  const refError = await orderReferenceError(parsed.data, site.organisationId);
  if (refError) return fail(refError, 422);

  // Products are company master data; free text is accepted only when no product record is chosen.
  const productName = (await lookupProductName(parsed.data.productId)) ?? parsed.data.product?.trim();
  if (!productName) return fail("Choose a product for this order", 422);

  const customOrderNumber = parsed.data.orderNumber?.trim();
  if (customOrderNumber) {
    const existing = await prisma.weighbridgeOrder.findUnique({ where: { orderNumber: customOrderNumber } });
    if (existing) {
      return fail(`Order number '${customOrderNumber}' is already registered`, 409);
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const orderNumber = customOrderNumber || (await nextOrderNumber());
      const order = await prisma.weighbridgeOrder.create({
        data: {
          ...parsed.data,
          product: productName,
          orderNumber,
          createdById: a.session!.user.id,
        },
        include: {
          site: true,
          source: true,
          destination: true,
          productRef: true,
          createdBy: { select: safeUserSelect },
        },
      });
      await audit({
        ...auditActor(a.session!.user),
        siteId: site.id,
        action: "ORDER_CREATED",
        entityType: "weighbridge_order",
        entityId: order.id,
        afterData: order,
      });
      return ok(order, 201);
    } catch (error) {
      if (customOrderNumber) return fail(`Could not create order with number '${customOrderNumber}'`, 409);
      if (attempt === 2) return fail("Could not allocate an order number, please retry", 409);
    }
  }
  return fail("Could not create order", 500);
});
