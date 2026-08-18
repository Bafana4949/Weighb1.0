import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { dateRange } from "@/lib/reports";
import { rateLimitOrFail } from "@/lib/rate-limit";

function csv(value: unknown) {
  const text = String(value ?? "—");
  return `"${text.replaceAll('"', '""')}"`;
}

function isoDate(d: Date | null) { return d ? d.toISOString().slice(0, 10) : "—"; }
function isoTime(d: Date | null) { return d ? d.toISOString().slice(11, 19) : "—"; }

function formatTurnaroundTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const limited = rateLimitOrFail(request, "reports-export-csv", 20, 5 * 60 * 1000);
  if (limited) return limited;

  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const orgFilter = url.searchParams.get("org");
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
    capturedAt: dateRange(url.searchParams),
    ...(a.session!.user.role === "TRANSPORTER" ? { booking: { transporterOrganisationId: a.session!.user.organisationId! } } : {
      site: mineScope(a.session!.user.organisationId),
      ...(orgFilter ? { booking: { transporterOrganisationId: orgFilter } } : {})
    }),
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

  const rows = await prisma.weighbridgeTransaction.findMany({
    where,
    include: {
      site: true,
      vehicle: true,
      driver: true,
      trailer: true,
      booking: {
        include: {
          transporterOrganisation: true,
          order: {
            include: { originSite: true, destinationSite: true, source: true, destination: true }
          }
        }
      }
    },
    orderBy: { capturedAt: "asc" },
    take: 50000
  });

  const header = [
    "Transaction No",
    "Tran Date",
    "Tran Time",
    "Order No",
    "Supplier",
    "Customer",
    "Tran Type",
    "Material",
    "Destination",
    "Source",
    "Truck No",
    "Gross Date",
    "Gross Time",
    "Tare Date",
    "Tare Time",
    "Nett Weight",
    "Gross Weight",
    "Tare Weight",
    "Total Tran Time",
    "Transporter",
    "Mine Ticket No",
    "Mine Ticket Mass",
    "Driver"
  ];

  const lines = [
    header.map(csv).join(","),
    ...rows.map(row => {
      const transactionNo = row.waybillNumber || row.edgeTransactionId;
      const tranDate = isoDate(row.capturedAt);
      const tranTime = isoTime(row.capturedAt);
      const orderNo = row.booking?.order?.orderNumber ?? row.booking?.reference ?? "—";
      const supplier = row.booking?.order?.supplierName ?? "—";
      const customer = row.booking?.order?.customerName ?? "—";
      const tranType = row.transactionType ?? "—";
      const material = row.commodity ?? "—";
      const destination = row.booking?.order?.destination?.name ?? row.booking?.order?.destinationSite?.name ?? "—";
      const source = row.booking?.order?.source?.name ?? row.booking?.order?.originSite?.name ?? "—";
      const truckNo = row.vehicle?.plate ?? "—";
      const grossDate = isoDate(row.grossCapturedAt ?? row.entryAt);
      const grossTime = isoTime(row.grossCapturedAt ?? row.entryAt);
      const tareDate = isoDate(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt);
      const tareTime = isoTime(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt);
      const netWeight = row.netWeightKg;
      const grossWeight = row.grossWeightKg;
      const tareWeight = row.tareWeightKg;
      const totalTranTime = formatTurnaroundTime(row.turnaroundSeconds);
      const transporter = row.booking?.transporterOrganisation?.name ?? "—";
      const mineTicketNo = row.mineTicketNumber ?? "—";
      const mineTicketMass = row.mineTicketMass ?? "—";
      const driverName = row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : "—";

      return [
        transactionNo,
        tranDate,
        tranTime,
        orderNo,
        supplier,
        customer,
        tranType,
        material,
        destination,
        source,
        truckNo,
        grossDate,
        grossTime,
        tareDate,
        tareTime,
        netWeight,
        grossWeight,
        tareWeight,
        totalTranTime,
        transporter,
        mineTicketNo,
        mineTicketMass,
        driverName
      ].map(csv).join(",");
    })
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="weighbridge-transactions-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
