import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, requireRole } from "@/lib/api";
import { formatKg } from "@/lib/utils";
import { WaybillDocument } from "./waybill-document";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (access.error) return access.error;

  const { id } = await params;
  const transaction = await prisma.weighbridgeTransaction.findUnique({
    where: { id },
    include: {
      site: { include: { organisation: true } },
      vehicle: true,
      trailer: true,
      driver: true,
      operator: true,
      booking: { include: { transporterOrganisation: true, order: { include: { originSite: true, destinationSite: true } }, additionalTrailers: { include: { trailer: true }, orderBy: { position: "asc" } } } },
    },
  });
  if (!transaction || (access.session!.user.role === "TRANSPORTER" && transaction.booking.transporterOrganisationId !== access.session!.user.organisationId)) {
    return fail("Transaction not found", 404);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "thermal") {
    const receipt = [
      transaction.waybillNumber,
      transaction.site.name,
      transaction.capturedAt.toLocaleString("en-ZA", { timeZone: transaction.site.timezone }),
      "-------------------------------",
      `VEHICLE ${transaction.vehicle.plate}`,
      `DRIVER  ${transaction.driver.firstName} ${transaction.driver.lastName}`,
      `GROSS   ${formatKg(transaction.grossWeightKg)}`,
      `TARE    ${formatKg(transaction.tareWeightKg)}`,
      `NET     ${formatKg(transaction.netWeightKg)}`,
      `STATUS  ${transaction.overload ? "FAIL" : "PASS"}`,
      "-------------------------------",
      transaction.integrityHash,
    ].join("\n");
    return new Response(receipt, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${transaction.waybillNumber}-thermal.txt"`,
      },
    });
  }

  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/verify/${transaction.integrityHash}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 180, margin: 1 });
  const tz = transaction.site.timezone;
  const order = transaction.booking.order;
  const isDispatch = order?.type === "DISPATCH";
  const supplierOrigin = isDispatch ? transaction.site.name : (order?.supplierName ?? order?.originSite?.name ?? "—");
  const destination = isDispatch ? (order?.customerName ?? order?.destinationSite?.name ?? "—") : transaction.site.name;
  const trailerRegs = [
    transaction.trailer ? (transaction.trailer.registrationNo ?? transaction.trailer.trailerId) : null,
    ...transaction.booking.additionalTrailers.map((bt) => bt.trailer.registrationNo ?? bt.trailer.trailerId),
  ].filter((v): v is string => Boolean(v));
  const document = React.createElement(WaybillDocument, {
    waybillNumber: transaction.waybillNumber,
    transactionType: order?.type ?? null,
    siteName: transaction.site.name,
    siteAddress: transaction.site.address,
    organisationName: transaction.site.organisation.name,
    organisationPhone: transaction.site.organisation.contactPhone,
    organisationRegNo: transaction.site.organisation.registrationNo,
    vehiclePlate: transaction.vehicle.plate,
    trailerReg: trailerRegs.length ? trailerRegs.join(" ") : null,
    operatorName: transaction.operator ? `${transaction.operator.firstName} ${transaction.operator.lastName}` : "AUTOMATED",
    transportCompany: transaction.booking.transporterOrganisation.name,
    dateTimeIn: transaction.entryAt ? transaction.entryAt.toLocaleString("en-ZA", { timeZone: tz }) : null,
    dateTimeOut: transaction.exitAt ? transaction.exitAt.toLocaleString("en-ZA", { timeZone: tz }) : null,
    supplierOrigin,
    destination,
    product: order?.product ?? transaction.commodity,
    purchaseOrderNo: order?.orderNumber ?? "—",
    externalRef: transaction.booking.reference,
    stockpileRef: order?.stockpile ?? "—",
    comment: order?.notes ?? "—",
    driverName: `${transaction.driver.firstName} ${transaction.driver.lastName}`,
    driverLicenceNumber: transaction.driver.licenceNumber,
    grossWeightKg: transaction.grossWeightKg,
    tareWeightKg: transaction.tareWeightKg,
    netWeightKg: transaction.netWeightKg,
    overload: transaction.overload,
    overloadVarianceKg: transaction.overloadVarianceKg,
    integrityHash: transaction.integrityHash,
    qrDataUrl,
  });
  const buffer = await renderToBuffer(document as unknown as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${transaction.waybillNumber}.pdf"`,
    },
  });
}
