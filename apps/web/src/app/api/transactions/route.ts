import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { parsePagination, siteIdentifierWhere } from "@/lib/utils";
import { userScope } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";

function isoDate(d: Date | null) { return d ? d.toISOString().slice(0, 10) : null; }
function isoTime(d: Date | null) { return d ? d.toISOString().slice(11, 19) : null; }

function formatTurnaroundTime(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const site = url.searchParams.get("site");
  const vehicle = url.searchParams.get("vehicle");
  const transactionNo = url.searchParams.get("transactionNo");
  const orderNo = url.searchParams.get("orderNo");
  const supplier = url.searchParams.get("supplier");
  const customer = url.searchParams.get("customer");
  const type = url.searchParams.get("type");
  const material = url.searchParams.get("material");
  const source = url.searchParams.get("source");
  const destination = url.searchParams.get("destination");
  const transporter = url.searchParams.get("transporter");
  const driver = url.searchParams.get("driver");
  const overload = url.searchParams.get("overload");
  const status = url.searchParams.get("status");
  const mineTicketNo = url.searchParams.get("mineTicketNo");

  const andConditions: any[] = [];

  if (isPlatformSuperAdmin(a.session!.user)) {
    // Platform super admin has platform-wide access
  } else if (a.session!.user.role === "TRANSPORTER") {
    andConditions.push({ booking: { transporterOrganisationId: a.session!.user.organisationId! } });
  } else {
    andConditions.push({ site: userScope(a.session!.user) });
  }
  if (site) {
    andConditions.push({ site: siteIdentifierWhere(site) });
  }
  if (vehicle) {
    andConditions.push({ vehicleId: vehicle });
  }
  if (from || to) {
    andConditions.push({
      capturedAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to.includes('T') ? to : `${to}T23:59:59.999Z`) } : {})
      }
    });
  }
  if (transactionNo) {
    andConditions.push({ OR: [{ edgeTransactionId: transactionNo }, { waybillNumber: transactionNo }] });
  }
  if (orderNo) {
    andConditions.push({ booking: { order: { orderNumber: orderNo } } });
  }
  if (supplier) {
    andConditions.push({
      OR: [
        { booking: { order: { supplierName: supplier } } },
        { site: { organisation: { name: supplier } } }
      ]
    });
  }
  if (customer) {
    andConditions.push({ booking: { order: { customerName: customer } } });
  }
  if (type) {
    andConditions.push({ transactionType: type });
  }
  if (material) {
    andConditions.push({ commodity: material });
  }
  if (source) {
    andConditions.push({ OR: [{ booking: { order: { source: { name: source } } } }, { booking: { order: { originSite: { name: source } } } }] });
  }
  if (destination) {
    andConditions.push({ OR: [{ booking: { order: { destination: { name: destination } } } }, { booking: { order: { destinationSite: { name: destination } } } }] });
  }
  if (transporter) {
    andConditions.push({ booking: { transporterOrganisation: { name: transporter } } });
  }
  if (driver) {
    andConditions.push({ driver: { OR: [{ firstName: driver }, { lastName: driver }] } });
  }
  if (overload === "true") {
    andConditions.push({ overload: true });
  } else if (overload === "false") {
    andConditions.push({ overload: false });
  }
  if (status) {
    andConditions.push({ status });
  }
  if (mineTicketNo) {
    andConditions.push({ mineTicketNumber: mineTicketNo });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const [rows, total] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({
      where,
      include: {
        vehicle: true,
        driver: true,
        site: { include: { organisation: true } },
        booking: {
          include: {
            transporterOrganisation: true,
            order: {
              include: { originSite: true, destinationSite: true, source: true, destination: true }
            }
          }
        }
      },
      orderBy: { capturedAt: "desc" },
      skip,
      take: limit
    }),
    prisma.weighbridgeTransaction.count({ where })
  ]);

  const mappedRows = rows.map(r => ({
    transactionNo: r.waybillNumber || r.edgeTransactionId,
    transactionDate: isoDate(r.capturedAt),
    transactionTime: isoTime(r.capturedAt),
    orderNo: r.booking?.order?.orderNumber ?? null,
    supplier: r.booking?.order?.supplierName || r.site?.organisation?.name || r.booking?.order?.originSite?.name || null,
    customer: r.booking?.order?.customerName ?? null,
    transactionType: r.transactionType ?? null,
    material: r.commodity ?? null,
    destination: r.booking?.order?.destination?.name ?? r.booking?.order?.destinationSite?.name ?? null,
    source: r.booking?.order?.source?.name ?? r.booking?.order?.originSite?.name ?? null,
    truckNo: r.vehicle?.plate ?? "",
    grossDate: isoDate(r.grossCapturedAt ?? r.entryAt),
    grossTime: isoTime(r.grossCapturedAt ?? r.entryAt),
    tareDate: isoDate(r.tareCapturedAt ?? r.exitAt ?? r.capturedAt), // Use capturedAt as fallback if both missing
    tareTime: isoTime(r.tareCapturedAt ?? r.exitAt ?? r.capturedAt),
    netWeight: r.netWeightKg,
    grossWeight: r.grossWeightKg,
    tareWeight: r.tareWeightKg,
    totalTransactionTime: formatTurnaroundTime(r.turnaroundSeconds),
    transporter: r.booking?.transporterOrganisation?.name ?? null,
    mineTicketNo: r.mineTicketNumber ?? null,
    mineTicketMass: r.mineTicketMass ?? null,
    driver: r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : null
  }));

  return ok(mappedRows, 200, { page, total, limit });
});
