import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { dateRange } from "@/lib/reports";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { TransactionDocument } from "./transaction-document";

export const runtime = "nodejs";

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
  const limited = rateLimitOrFail(request, "reports-export-pdf-tx", 20, 5 * 60 * 1000);
  if (limited) return limited;

  const access = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.TRANSPORTER, UserRole.SECURITY]);
  if (access.error) return access.error;

  const url = new URL(request.url);
  const range = dateRange(url.searchParams);
  const orgFilter = url.searchParams.get("org");
  const scope = access.session!.user.role === "TRANSPORTER" 
    ? { booking: { transporterOrganisationId: access.session!.user.organisationId! } }
    : { site: mineScope(access.session!.user.organisationId), ...(orgFilter ? { booking: { transporterOrganisationId: orgFilter } } : {}) };

  // Note: Only capturing the base date filter here for the PDF. 
  // If full advanced filters are needed on PDF export, we would parse them all here like the CSV route does.
  // For brevity and to ensure PDF generation works for the primary use case, we support the standard date/scope filtering.
  // If the user selects advanced filters, they will be passed in the URL.
  const transactionNo = url.searchParams.get("transactionNo");
  const orderNo = url.searchParams.get("orderNo");
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const overload = url.searchParams.get("overload");

  const where: any = {
    capturedAt: range,
    ...scope,
    ...(transactionNo ? { OR: [{ edgeTransactionId: transactionNo }, { waybillNumber: transactionNo }] } : {}),
    ...(orderNo ? { booking: { order: { orderNumber: orderNo } } } : {}),
    ...(type ? { transactionType: type } : {}),
    ...(status ? { status } : {}),
    ...(overload === "true" ? { overload: true } : overload === "false" ? { overload: false } : {}),
  };

  const [dbRows, organisation] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({
      where,
      include: {
        vehicle: true,
        driver: true,
        site: true,
        booking: { include: { transporterOrganisation: true, order: { include: { originSite: true, destinationSite: true, source: true, destination: true } } } }
      },
      orderBy: { capturedAt: "asc" },
      take: 2000 // Limit PDF size
    }),
    access.session!.user.organisationId ? prisma.organisation.findUnique({ where: { id: access.session!.user.organisationId } }) : Promise.resolve(null),
  ]);

  const mappedRows = dbRows.map(row => ({
    transactionNo: row.waybillNumber || row.edgeTransactionId,
    transactionDate: isoDate(row.capturedAt),
    transactionTime: isoTime(row.capturedAt),
    orderNo: row.booking?.order?.orderNumber ?? row.booking?.reference ?? "—",
    supplier: row.booking?.order?.supplierName ?? "—",
    customer: row.booking?.order?.customerName ?? "—",
    transactionType: row.transactionType ?? "—",
    material: row.commodity ?? "—",
    destination: row.booking?.order?.destination?.name ?? row.booking?.order?.destinationSite?.name ?? "—",
    source: row.booking?.order?.source?.name ?? row.booking?.order?.originSite?.name ?? "—",
    truckNo: row.vehicle?.plate ?? "—",
    grossDate: isoDate(row.grossCapturedAt ?? row.entryAt),
    grossTime: isoTime(row.grossCapturedAt ?? row.entryAt),
    tareDate: isoDate(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt),
    tareTime: isoTime(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt),
    netWeight: row.netWeightKg,
    grossWeight: row.grossWeightKg,
    tareWeight: row.tareWeightKg,
    totalTransactionTime: formatTurnaroundTime(row.turnaroundSeconds),
    transporter: row.booking?.transporterOrganisation?.name ?? "—",
    mineTicketNo: row.mineTicketNumber ?? "—",
    mineTicketMass: row.mineTicketMass ?? "—",
    driver: row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : "—"
  }));

  const totalNet = dbRows.reduce((sum, r) => sum + r.netWeightKg, 0);
  const totalGross = dbRows.reduce((sum, r) => sum + r.grossWeightKg, 0);
  const totalTare = dbRows.reduce((sum, r) => sum + r.tareWeightKg, 0);
  const avgNet = dbRows.length ? totalNet / dbRows.length : 0;
  
  const validTurnarounds = dbRows.filter(r => r.turnaroundSeconds !== null);
  const avgTimeSecs = validTurnarounds.length ? validTurnarounds.reduce((sum, r) => sum + r.turnaroundSeconds!, 0) / validTurnarounds.length : 0;

  const document = React.createElement(TransactionDocument, {
    organisationName: organisation?.name ?? "All companies",
    from: range.gte.toISOString().slice(0, 10),
    to: range.lte.toISOString().slice(0, 10),
    rows: mappedRows,
    totalNet,
    totalGross,
    totalTare,
    avgNet,
    avgTime: formatTurnaroundTime(Math.round(avgTimeSecs)),
    generatedAt: new Date().toLocaleString("en-ZA"),
  });

  const buffer = await renderToBuffer(document as unknown as Parameters<typeof renderToBuffer>[0]);
  const isDownload = url.searchParams.get("download") === "true";
  const disposition = isDownload ? "attachment" : "inline";
  
  return new Response(new Uint8Array(buffer), {
    headers: { 
      "content-type": "application/pdf", 
      "content-disposition": `${disposition}; filename="transactions-${range.gte.toISOString().slice(0, 10)}-to-${range.lte.toISOString().slice(0, 10)}.pdf"` 
    },
  });
}
