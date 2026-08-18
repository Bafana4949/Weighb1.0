import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { promises as fs } from "fs";
import path from "path";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, requirePermission, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { formatKg } from "@/lib/utils";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { WaybillDocument } from "./waybill-document";

export const runtime = "nodejs";

const COPY_LABELS: Record<string, string> = { CLIENT: "CLIENT / OFFICE COPY", DRIVER: "DRIVER / TRANSPORTER COPY", SECURITY: "SECURITY / GATE COPY" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Limit sized for one legitimate print action (3 copies) repeated a
  // reasonable number of times per window, not a single ticket looped.
  const limited = rateLimitOrFail(request, "transaction-waybill-print", 60, 5 * 60 * 1000);
  if (limited) return limited;
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
  const copyParam = (url.searchParams.get("copy") ?? "CLIENT").toUpperCase();
  const copyLabel = COPY_LABELS[copyParam] ?? COPY_LABELS.CLIENT!;
  // Deliberately NOT derived from transaction.printedAt here: all three copies of one
  // "print" action are separate HTTP requests, and the first copy's write would make
  // transaction.printedAt non-null before the second/third copy's request is even sent
  // — checking DB state per-request would mislabel copies 2 and 3 as reprints. The
  // caller (the waybill page) decides once, at page-render time, whether this whole
  // batch of copy links is an initial print or a reprint, and bakes that into every link.
  const isReprint = url.searchParams.get("reprint") === "true";

  const permCheck = await requirePermission(isReprint ? "transaction.reprint" : "transaction.print");
  if (permCheck.error) return permCheck.error;

  const updated = await prisma.weighbridgeTransaction.update({
    where: { id },
    data: { printedAt: transaction.printedAt ?? new Date(), printCount: { increment: 1 }, lastPrintedById: access.session!.user.id },
  });
  await audit({
    userId: access.session!.user.id, siteId: transaction.siteId,
    action: isReprint ? "TRANSACTION_REPRINTED" : "TRANSACTION_PRINTED",
    entityType: "weighbridge_transaction", entityId: id,
    afterData: { copy: copyParam, printCount: updated.printCount },
  });

  const tz = transaction.site.timezone;
  const order = transaction.booking.order;
  const isDispatch = order?.type ? order.type === "DISPATCH" : true;
  const transactionType: "DISPATCH" | "RECEIPT" = isDispatch ? "DISPATCH" : "RECEIPT";

  // Status: Complete or Incomplete
  const isComplete = (transaction.tareWeightKg > 0 && transaction.grossWeightKg > 0 && transaction.exitAt !== null) || !!transaction.reconciledAt;
  const status: "COMPLETE" | "INCOMPLETE" = isComplete ? "COMPLETE" : "INCOMPLETE";

  // Product name resolution
  const COMMODITY_NAMES: Record<string, string> = {
    COAL: "High-Grade Export Coal (RB1 6000 kcal/kg)",
    IRON_ORE: "High-Grade Magnetite Iron Ore 64% Fe",
    CHROME: "Washed Metallurgical Chrome Ore 42%",
    PLATINUM: "PGM Platinum Concentrate Ore",
    GOLD: "Gold-Bearing Quartz Reef Ore",
    COPPER: "Refined Copper Cathode / Ore",
    MANGANESE: "High-Grade Lumpy Manganese Ore 44%",
  };
  let product = order?.product || (transaction.commodity ? (COMMODITY_NAMES[transaction.commodity.toUpperCase()] || transaction.commodity) : null);
  if (!product || product.toUpperCase() === "UNKNOWN") {
    product = "High-Grade Export Coal (RB1 6000 kcal/kg)";
  }


  // Supplier details
  const supplierName = isDispatch 
    ? transaction.site.organisation.name 
    : (order?.supplierName || "Seriti Mining Operations");
  const supplierPhone = transaction.site.organisation.contactPhone;
  const supplierRegNo = transaction.site.organisation.registrationNo;

  // Locations
  const dispatchLocation = isDispatch 
    ? `${transaction.site.name} (${order?.stockpile ? `Pit ${order.stockpile}` : "Main Stockpile 1"})` 
    : (order?.originSite?.name || order?.supplierName || "Dispatch Terminal / Pit A");

  const receiptLocation = isDispatch 
    ? (order?.customerName || order?.destinationSite?.name || "Richards Bay Coal Terminal (RBCT)") 
    : transaction.site.name;

  const trailerRegs = [
    transaction.trailer ? (transaction.trailer.registrationNo ?? transaction.trailer.trailerId) : null,
    ...transaction.booking.additionalTrailers.map((bt) => bt.trailer.registrationNo ?? bt.trailer.trailerId),
  ].filter((v): v is string => Boolean(v));

  // 1st & 2nd Weighments and Times
  const firstWeightLabel = isDispatch ? "1st Tare" : "1st Gross";
  const firstWeightKg = isDispatch ? transaction.tareWeightKg : transaction.grossWeightKg;
  const firstTime = transaction.entryAt ? transaction.entryAt.toLocaleString("en-ZA", { timeZone: tz }) : transaction.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  const secondWeightLabel = isDispatch ? "2nd Gross" : "2nd Tare";
  const secondWeightKg = isDispatch ? transaction.grossWeightKg : transaction.tareWeightKg;
  const secondTime = transaction.exitAt ? transaction.exitAt.toLocaleString("en-ZA", { timeZone: tz }) : transaction.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  if (url.searchParams.get("format") === "thermal") {
    const receipt = [
      isReprint ? "*** REPRINT ***" : null,
      copyLabel,
      "===============================",
      `WAYBILL : ${transaction.waybillNumber}`,
      `TYPE    : ${transactionType}`,
      `STATUS  : ${status}`,
      `SITE    : ${transaction.site.name}`,
      `DATE    : ${transaction.capturedAt.toLocaleString("en-ZA", { timeZone: tz })}`,
      "-------------------------------",
      `SUPPLIER: ${supplierName}`,
      `DISPATCH: ${dispatchLocation}`,
      `RECEIPT : ${receiptLocation}`,
      `PRODUCT : ${product}`,
      `ORDER NO: ${order?.orderNumber || "—"}`,
      "-------------------------------",
      `TRUCK   : ${transaction.vehicle.plate}`,
      `TRAILER : ${trailerRegs.join(" ") || "None"}`,
      `CARRIER : ${transaction.booking.transporterOrganisation.name}`,
      `DRIVER  : ${transaction.driver.firstName} ${transaction.driver.lastName}`,
      `LICENCE : ${transaction.driver.licenceNumber}`,
      "-------------------------------",
      `1st WEIGH (${firstWeightLabel}):`,
      `  WT: ${formatKg(firstWeightKg)} | TIME: ${firstTime}`,
      `2nd WEIGH (${secondWeightLabel}):`,
      `  WT: ${formatKg(secondWeightKg)} | TIME: ${secondTime}`,
      "-------------------------------",
      `GROSS   : ${formatKg(transaction.grossWeightKg)}`,
      `TARE    : ${formatKg(transaction.tareWeightKg)}`,
      `NET     : ${formatKg(transaction.netWeightKg)}`,
      `AXLE    : ${transaction.overload ? `OVERLOAD (+${formatKg(transaction.overloadVarianceKg)})` : "PASS (LEGAL)"}`,
      "===============================",
      `HASH: ${transaction.integrityHash}`,
    ].filter((line): line is string => line !== null).join("\n");
    return new Response(receipt, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${transaction.waybillNumber}-${copyParam.toLowerCase()}-thermal.txt"`,
      },
    });
  }

  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/verify/${transaction.integrityHash}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 180, margin: 1 });

  const logoBuffer = await fs.readFile(path.join(process.cwd(), "public", "brand", "logo-mark.png"));
  const logoDataUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const document = React.createElement(WaybillDocument, {
    waybillNumber: transaction.waybillNumber,
    transactionType,
    status,
    copyLabel: isReprint ? `REPRINT — ${copyLabel}` : copyLabel,
    siteName: transaction.site.name,
    siteAddress: transaction.site.address,
    supplierName,
    supplierPhone,
    supplierRegNo,
    dispatchLocation,
    receiptLocation,
    vehiclePlate: transaction.vehicle.plate,
    trailerReg: trailerRegs.length ? trailerRegs.join(" ") : null,
    operatorName: transaction.operator ? `${transaction.operator.firstName} ${transaction.operator.lastName}` : "AUTOMATED",
    transportCompany: transaction.booking.transporterOrganisation.name,
    product,
    orderNumber: order?.orderNumber ?? "—",
    externalRef: transaction.booking.reference,
    stockpileRef: order?.stockpile ?? "—",
    comment: order?.notes ?? "—",
    driverName: `${transaction.driver.firstName} ${transaction.driver.lastName}`,
    driverLicenceNumber: transaction.driver.licenceNumber,
    firstWeightLabel,
    firstWeightKg,
    firstTime,
    secondWeightLabel,
    secondWeightKg,
    secondTime,
    grossWeightKg: transaction.grossWeightKg,
    tareWeightKg: transaction.tareWeightKg,
    netWeightKg: transaction.netWeightKg,
    overload: transaction.overload,
    overloadVarianceKg: transaction.overloadVarianceKg,
    integrityHash: transaction.integrityHash,
    qrDataUrl,
    logoDataUrl,
  });
  const buffer = await renderToBuffer(document as unknown as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${transaction.waybillNumber}-${copyParam.toLowerCase()}${isReprint ? "-reprint" : ""}.pdf"`,
    },
  });
}

