import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, requireRole } from "@/lib/api";
import { parsePagination, siteIdentifierWhere } from "@/lib/utils";

function isoDate(d: Date | null) { return d ? d.toISOString().slice(0, 10) : null; }
function isoTime(d: Date | null) { return d ? d.toISOString().slice(11, 19) : null; }

function formatTurnaroundTime(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function GET(request: Request) {
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

  const where: any = {
    ...(a.session!.user.role === "TRANSPORTER" ? { booking: { transporterOrganisationId: a.session!.user.organisationId! } } : {}),
    ...(site ? { site: siteIdentifierWhere(site) } : {}),
    ...(vehicle ? { vehicleId: vehicle } : {}),
    ...((from || to) ? { capturedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to.includes('T') ? to : `${to}T23:59:59.999Z`) } : {}) } } : {}),
    ...(transactionNo ? { OR: [{ edgeTransactionId: transactionNo }, { waybillNumber: transactionNo }] } : {}),
    ...(orderNo ? { booking: { order: { orderNumber: orderNo } } } : {}),
    ...(supplier ? { booking: { order: { supplierName: supplier } } } : {}),
    ...(customer ? { booking: { order: { customerName: customer } } } : {}),
    ...(type ? { transactionType: type } : {}),
    ...(material ? { commodity: material } : {}),
    ...(source ? { OR: [{ booking: { order: { source: { name: source } } } }, { booking: { order: { originSite: { name: source } } } }] } : {}),
    ...(destination ? { OR: [{ booking: { order: { destination: { name: destination } } } }, { booking: { order: { destinationSite: { name: destination } } } }] } : {}),
    ...(transporter ? { booking: { transporterOrganisation: { name: transporter } } } : {}),
    ...(driver ? { driver: { OR: [{ firstName: driver }, { lastName: driver }] } } : {}),
    ...(overload === "true" ? { overload: true } : overload === "false" ? { overload: false } : {}),
    ...(status ? { status } : {}),
    ...(mineTicketNo ? { mineTicketNumber: mineTicketNo } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({
      where,
      include: {
        vehicle: true,
        driver: true,
        site: true,
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
    supplier: r.booking?.order?.supplierName ?? null,
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
}
