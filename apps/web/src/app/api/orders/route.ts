import { OrderStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { audit } from "@/lib/audit";
import { userScope } from "@/lib/access";
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

  const scope = isSuperAdmin
    ? {}
    : isTransporter
      ? { bookings: { some: { transporterOrganisationId: a.session!.user.organisationId! } } }
      : { site: userScope(a.session!.user) };

  const orders = await prisma.weighbridgeOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(site ? { siteId: site } : {}),
      ...scope,
    },
    include: {
      site: true,
      originSite: true,
      destinationSite: true,
      source: true,
      destination: true,
      productRef: true,
      createdBy: { select: safeUserSelect },
      bookings: { include: { transactions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok(orders);
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
  const callerOrg = a.session!.user.organisationId;
  if (!isPlatformSuperAdmin(a.session!.user) && callerOrg && site.organisationId !== callerOrg) {
    return fail("Weighbridge site is unavailable", 422);
  }

  // Look up product name from Product record if productId is provided
  let productName = parsed.data.product;
  if (parsed.data.productId) {
    const prod = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (prod) {
      productName = prod.name;
    }
  }
  if (!productName || productName.toUpperCase() === "UNKNOWN") {
    productName = "High-Grade Export Coal (RB1 6000 kcal/kg)";
  }

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
        userId: a.session!.user.id,
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
