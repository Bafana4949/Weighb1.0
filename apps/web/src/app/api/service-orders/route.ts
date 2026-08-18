import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { mineScope } from "@/lib/access";
import { audit } from "@/lib/audit";
import { routeNotification } from "@/lib/notifications";
import { parsePagination,safeUserSelect } from "@/lib/utils";
import { serviceOrderSchema } from "@/lib/validation";
import { rateLimitOrFail } from "@/lib/rate-limit";

async function nextTicketNumber(tx: Prisma.TransactionClient, orgCode: string): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = `SO-${orgCode}-${datePart}-`;
  const count = await tx.serviceOrder.count({ where: { orderNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function GET(request: Request) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const status = url.searchParams.get("status");
  const orgFilter = url.searchParams.get("organisationId");
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const where = {
    ...(isSuperAdmin ? (orgFilter ? { organisationId: orgFilter } : {}) : mineScope(a.session!.user.organisationId)),
    ...(status ? { status: status as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.serviceOrder.findMany({ where, include: { organisation: true, site: true, createdBy: { select: safeUserSelect }, assignedTo: { select: safeUserSelect } }, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.serviceOrder.count({ where }),
  ]);
  return ok(rows, 200, { page, total, limit });
}

export async function POST(request: Request) {
  const limited = rateLimitOrFail(request, "service-orders-create", 30, 5 * 60 * 1000);
  if (limited) return limited;
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const parsed = serviceOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid service order", 422);
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const organisationId = isSuperAdmin ? parsed.data.organisationId : a.session!.user.organisationId;
  if (!organisationId) return fail(isSuperAdmin ? "organisationId is required when the platform administrator creates a service order" : "User is not linked to an organisation", 422);
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!organisation) return fail("Organisation not found", 404);
  if (parsed.data.siteId) {
    const site = await prisma.site.findFirst({ where: { id: parsed.data.siteId, organisationId } });
    if (!site) return fail("Site does not belong to this organisation", 422);
  }
  try {
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextTicketNumber(tx, organisation.code ?? "ORG");
      return tx.serviceOrder.create({
        data: {
          orderNumber, organisationId, siteId: parsed.data.siteId ?? null, title: parsed.data.title, description: parsed.data.description,
          category: parsed.data.category, priority: parsed.data.priority ?? "MEDIUM",
          source: isSuperAdmin ? "PLATFORM_ADMIN" : "CLIENT_USER", createdById: a.session!.user.id,
          contactName: parsed.data.contactName ?? null, contactPhone: parsed.data.contactPhone ?? null, contactEmail: parsed.data.contactEmail ?? null,
          deviceId: parsed.data.deviceId ?? null, transactionId: parsed.data.transactionId ?? null, incidentId: parsed.data.incidentId ?? null,
          dueAt: parsed.data.dueAt ?? null,
        },
        include: { organisation: true, site: true, createdBy: { select: safeUserSelect } },
      });
    });
    await audit({ userId: a.session!.user.id, siteId: order.siteId, action: "SERVICE_ORDER_CREATED", entityType: "service_order", entityId: order.id, afterData: { orderNumber: order.orderNumber, category: order.category, priority: order.priority } });
    await routeNotification({ event: "SERVICE_ORDER_CREATED", severity: order.priority === "CRITICAL" ? "HIGH" : "LOW", subject: `Service order ${order.orderNumber} created`, body: `${order.title} (${order.category}, ${order.priority})`, organisationId, metadata: { service_order_id: order.id } });
    return ok(order, 201);
  } catch {
    return fail("Could not generate a unique ticket number, please retry", 409);
  }
}
