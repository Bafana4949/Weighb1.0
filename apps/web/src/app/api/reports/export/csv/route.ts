import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { dateRange } from "@/lib/reports";
import { rateLimitOrFail } from "@/lib/rate-limit";

function csv(value: unknown) {
  const text = String(value ?? "—");
  return `"${text.replaceAll('"', '""')}"`;
}

import { formatSADate, formatSATime } from "@/lib/datetime";

const isoDate = formatSADate;
const isoTime = formatSATime;

function formatTurnaroundTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const GET = withScopeErrors(async function GET(request: Request) {
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

  const andConditions: any[] = [
    { capturedAt: dateRange(url.searchParams) }
  ];

  if (a.session!.user.role === "TRANSPORTER") {
    andConditions.push({ booking: { transporterOrganisationId: a.session!.user.organisationId! } });
  } else {
    andConditions.push({ site: userScope(a.session!.user) });
    if (orgFilter) {
      andConditions.push({ booking: { transporterOrganisationId: orgFilter } });
    }
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

  const where = { AND: andConditions };

  const rows = await prisma.weighbridgeTransaction.findMany({
    where,
    include: {
      site: { include: { organisation: true } },
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
      const supplier = row.booking?.order?.supplierName || row.site?.organisation?.name || row.booking?.order?.originSite?.name || "—";
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
});
