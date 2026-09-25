import { createHash } from "crypto";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireSiteOrRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { siteIdentifierWhere } from "@/lib/utils";
import { syncOrderFulfillmentStatus } from "@/lib/order-fulfillment";

import { buildWeighmentPayload, computeIntegrityHash, getChainHead } from "@/lib/chain";
import { assertWeightInvariant } from "@/lib/weights";
import { formatSADate } from "@/lib/datetime";

async function generateNextWaybillNumber(siteCode: string, siteId: string, client: any = prisma): Promise<string> {
  const dateStr = formatSADate(new Date()).replace(/-/g, "");
  const prefix = `WB-${siteCode}-${dateStr}-`;
  const lastToday = await client.weighbridgeTransaction.findFirst({
    where: {
      siteId,
      waybillNumber: { startsWith: prefix },
    },
    orderBy: { waybillNumber: "desc" },
    select: { waybillNumber: true },
  });

  let nextVal = 1;
  if (lastToday?.waybillNumber) {
    const parts = lastToday.waybillNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(lastSeq) && lastSeq >= nextVal) {
      nextVal = lastSeq + 1;
    }
  }
  return `${prefix}${nextVal.toString().padStart(6, "0")}`;
}

async function resolveOrCreateWalkInBooking({
  siteId,
  siteOrganisationId,
  plate,
  driverName,
  transporterName,
  trailer,
  commodity,
  orderId,
  operatorId,
}: {
  siteId: string;
  siteOrganisationId: string;
  plate: string;
  driverName?: string;
  transporterName?: string;
  trailer?: string;
  commodity?: string;
  orderId?: string;
  operatorId?: string | null;
}) {
  const plateClean = plate.trim().toUpperCase();
  const plateNorm = plateClean.replace(/[^A-Z0-9]/g, "");

  // 1. Resolve or Create Transporter Organisation
  let transporterOrg = null;
  if (transporterName && transporterName.trim()) {
    const tName = transporterName.trim();
    transporterOrg = await prisma.organisation.findFirst({
      where: { name: { equals: tName, mode: "insensitive" }, type: "HAULIER" },
    });
    if (!transporterOrg) {
      transporterOrg = await prisma.organisation.create({
        data: {
          name: tName,
          type: "HAULIER",
          status: "ACTIVE",
          isActive: true,
          contactEmail: `dispatch@${tName.toLowerCase().replace(/[^a-z0-9]/g, "")}.co.za`,
        },
      });
    }
  } else {
    transporterOrg = await prisma.organisation.findFirst({
      where: { type: "HAULIER", isActive: true },
    });
    if (!transporterOrg) {
      transporterOrg = await prisma.organisation.findUnique({
        where: { id: siteOrganisationId },
      });
    }
  }

  if (!transporterOrg) {
    throw new Error("Unable to resolve an organisation for this weighment");
  }

  // 2. Resolve or Create Vehicle
  let vehicle = await prisma.vehicle.findFirst({
    where: { plateNormalized: plateNorm, deletedAt: null },
  });
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        organisationId: transporterOrg.id,
        plate: plateClean,
        plateNormalized: plateNorm,
        make: "Standard",
        model: "Commercial Haulier",
        tareWeightKg: 14500,
        legalMaxGvwKg: 56000,
        insuranceExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        status: "ACTIVE",
      },
    });
  }

  // 3. Resolve or Create Driver
  let driver = null;
  const dParts = (driverName || "Driver Unknown").trim().split(" ");
  const firstName = dParts[0] || "Driver";
  const lastName = dParts.slice(1).join(" ") || "Haulier";

  driver = await prisma.driver.findFirst({
    where: {
      organisationId: transporterOrg.id,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
      deletedAt: null,
    },
  });

  if (!driver) {
    const rand = Math.random().toString(36).substring(2, 8);
    driver = await prisma.driver.create({
      data: {
        organisationId: transporterOrg.id,
        firstName,
        lastName,
        idNumberEncrypted: "N/A",
        idNumberHash: `id_${Date.now()}_${rand}`,
        rfidTag: `rfid_${Date.now()}_${rand}`,
        licenceNumber: `LIC-${rand.toUpperCase()}`,
        licenceExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        consentCapturedAt: new Date(),
      },
    });
  }

  // 4. Resolve or Create Trailer
  let trailerRecord = null;
  if (trailer && trailer.trim()) {
    const tClean = trailer.trim().toUpperCase();
    trailerRecord = await prisma.trailer.findFirst({
      where: { trailerId: tClean },
    });
    if (!trailerRecord) {
      trailerRecord = await prisma.trailer.create({
        data: {
          trailerId: tClean,
          registrationNo: tClean,
          tareWeightKg: 4200,
          vehicleId: vehicle.id,
        },
      });
    }
  }

  // 5. Create Instant Booking
  const ref = `WALK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const token = `JT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const fallbackUser = operatorId || (await prisma.user.findFirst())?.id || vehicle.organisationId;

  return await prisma.booking.create({
    data: {
      reference: ref,
      journeyToken: token,
      transporterOrganisationId: transporterOrg.id,
      siteId,
      vehicleId: vehicle.id,
      driverId: driver.id,
      trailerId: trailerRecord?.id ?? null,
      orderId: orderId ?? null,
      commodity: commodity?.trim() || "Coal (ROM)",
      targetTonnageKg: 34000,
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 24 * 3600 * 1000),
      status: "APPROVED",
      approvedAt: new Date(),
      approvalReason: "Manual walk-in weighment authorized by operator",
      createdById: fallbackUser,
    },
    include: { vehicle: true, driver: true, trailer: true, order: true },
  });
}

export async function GET(request: NextRequest) {
  const authCheck = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (authCheck.error) return authCheck.error;

  const site = request.nextUrl.searchParams.get("site");
  if (!site) return fail("site is required", 422);

  const resolvedSite = await prisma.site.findFirst({ where: siteIdentifierWhere(site) });
  if (!resolvedSite) return fail("Site not found", 404);

  if (authCheck.actor?.type === "user") {
    const callerUser = await prisma.user.findUnique({ where: { id: authCheck.actor.id } });
    if (callerUser && callerUser.platformRole !== "PLATFORM_SUPER_ADMIN" && callerUser.organisationId) {
      if (resolvedSite.organisationId !== callerUser.organisationId) {
        return fail("Forbidden: You do not have access to this site's weighments", 403);
      }
    }
  }

  // 1. Fetch transactions currently in progress (captured 1st weight, awaiting 2nd weight)
  const inProgress = await prisma.weighbridgeTransaction.findMany({
    where: {
      siteId: resolvedSite.id,
      status: "IN_PROGRESS",
    },
    include: {
      booking: {
        include: {
          order: true,
          transporterOrganisation: true,
        },
      },
      vehicle: true,
      driver: true,
      trailer: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const activeWeighments = inProgress.map((t) => {
    const isDispatch = t.tareCapturedAt !== null;
    const firstWeight = isDispatch ? t.tareWeightKg : t.grossWeightKg;
    const firstWeightType = isDispatch ? "TARE" : "GROSS";
    const entryTime = t.entryAt ?? t.createdAt;
    const minutesInYard = Math.max(0, Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000));

    return {
      id: t.id,
      bookingId: t.bookingId,
      bookingRef: t.booking.reference,
      plate: t.vehicle.plate,
      driver: `${t.driver.firstName} ${t.driver.lastName}`,
      trailer: t.trailer?.trailerId ?? "",
      transporter: t.booking.transporterOrganisation?.name ?? "",
      commodity: t.commodity,
      orderNumber: t.booking.order?.orderNumber ?? null,
      customerName: t.booking.order?.customerName ?? null,
      supplierName: t.booking.order?.supplierName ?? null,
      stockpile: t.booking.order?.stockpile ?? null,
      firstWeightKg: firstWeight,
      firstWeightType,
      firstWeightCapturedAt: t.tareCapturedAt ?? t.grossCapturedAt ?? entryTime,
      minutesInYard,
      legalMaxGvwKg: t.vehicle.legalMaxGvwKg,
    };
  });

  return ok({
    site: { id: resolvedSite.id, code: resolvedSite.code, name: resolvedSite.name },
    activeWeighments,
  });
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
    if (authCheck.error) return authCheck.error;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid JSON payload", 400);
    }

    const { action, siteCode, idempotencyKey } = body;
    if (!siteCode) return fail("siteCode is required", 422);

    const resolvedSite = await prisma.site.findFirst({ where: siteIdentifierWhere(siteCode) });
    if (!resolvedSite) return fail("Site not found", 404);

    if (authCheck.actor?.type === "user") {
      const callerUser = await prisma.user.findUnique({ where: { id: authCheck.actor.id } });
      if (callerUser && callerUser.platformRole !== "PLATFORM_SUPER_ADMIN" && callerUser.organisationId) {
        if (resolvedSite.organisationId !== callerUser.organisationId) {
          return fail("Forbidden: You do not have operator permissions for this site's organisation", 403);
        }
      }
    }

    const now = new Date();
    const operatorId = authCheck.actor?.type === "user" ? authCheck.actor.id : null;

  // --------------------------------------------------------------------------
  // ACTION: FIRST_WEIGH (Weigh-In / 1st Weight)
  // --------------------------------------------------------------------------
  if (action === "FIRST_WEIGH") {
    // Idempotency check: if this request was already recorded on the server, return it
    if (idempotencyKey) {
      const existing = await prisma.weighbridgeTransaction.findFirst({
        where: { edgeTransactionId: `IDEM-${idempotencyKey}` },
        include: { booking: { include: { vehicle: true } } },
      });
      if (existing) {
        const isDispatch = existing.tareCapturedAt !== null;
        const recordedWeight = isDispatch ? existing.tareWeightKg : existing.grossWeightKg;
        return ok({
          message: `1st Weighment captured successfully for ${existing.booking.vehicle.plate}: ${recordedWeight.toLocaleString()} kg (idempotent replay)`,
          transactionId: existing.id,
          status: existing.status,
          firstWeightKg: recordedWeight,
          firstWeightType: isDispatch ? "TARE" : "GROSS",
        });
      }
    }

    const { bookingId, weightKg, weighType, notes, plate, driverName, transporterName, trailer, commodity, orderId } = body;
    const parsedWeight = Math.round(Number(weightKg));

    if (!parsedWeight || parsedWeight <= 0) return fail("Valid scale weight (kg) is required", 422);

    let booking;
    if (bookingId) {
      booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, driver: true, trailer: true, order: true },
      });
      if (!booking) return fail("Booking not found", 404);
    } else if (plate && plate.trim()) {
      booking = await resolveOrCreateWalkInBooking({
        siteId: resolvedSite.id,
        siteOrganisationId: resolvedSite.organisationId,
        plate,
        driverName,
        transporterName,
        trailer,
        commodity,
        orderId,
        operatorId,
      });
    } else {
      return fail("Either bookingId or vehicle registration plate is required for 1st weighment", 422);
    }

    // Check if an in-progress transaction already exists for this booking
    const existingActive = await prisma.weighbridgeTransaction.findFirst({
      where: { bookingId: booking.id, status: "IN_PROGRESS" },
    });
    if (existingActive) {
      return fail(`Vehicle ${booking.vehicle.plate} already has an active 1st weighment recorded. Complete 2nd weighment instead.`, 409);
    }

    const isDispatch = weighType !== "RECEIPT";
    const tempEdgeId = idempotencyKey ? `IDEM-${idempotencyKey}` : `MANUAL-INPROG-${resolvedSite.code}-${Date.now()}`;
    const tempWaybill = `WB-INPROG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const prior = await prisma.weighbridgeTransaction.findFirst({
      where: { siteId: resolvedSite.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const previousHash = prior?.integrityHash ?? "0".repeat(64);
    const tempHash = createHash("sha256").update(`${tempEdgeId}:${now.toISOString()}`).digest("hex");

    let transaction: any;
    try {
      transaction = await prisma.weighbridgeTransaction.create({
        data: {
          edgeTransactionId: tempEdgeId,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          trailerId: booking.trailerId,
          driverId: booking.driverId,
          siteId: resolvedSite.id,
          operatorId,
          grossWeightKg: parsedWeight,
          tareWeightKg: parsedWeight,
          netWeightKg: 0,
          commodity: booking.commodity,
          waybillNumber: tempWaybill,
          previousHash,
          integrityHash: tempHash,
          status: "IN_PROGRESS",
          transactionType: "FIRST_WEIGH",
          entryAt: now,
          capturedAt: now,
          tareCapturedAt: isDispatch ? now : null,
          grossCapturedAt: isDispatch ? null : now,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === "P2002") {
        const target = String(createErr.meta?.target || "");
        if (target.includes("one_active_weighment_per_booking") || target.includes("booking_id")) {
          return fail(`Vehicle ${booking.vehicle.plate} already has an active 1st weighment recorded. Complete 2nd weighment instead.`, 409);
        }
        if (target.includes("edge_transaction_id") || target.includes("edgeTransactionId")) {
          const existing = await prisma.weighbridgeTransaction.findFirst({
            where: { edgeTransactionId: tempEdgeId },
            include: { booking: { include: { vehicle: true } } },
          });
          if (existing) {
            const isDisp = existing.tareCapturedAt !== null;
            const recWeight = isDisp ? existing.tareWeightKg : existing.grossWeightKg;
            return ok({
              message: `1st Weighment captured successfully for ${existing.booking.vehicle.plate}: ${recWeight.toLocaleString()} kg (idempotent replay)`,
              transactionId: existing.id,
              status: existing.status,
              firstWeightKg: recWeight,
              firstWeightType: isDisp ? "TARE" : "GROSS",
            });
          }
        }
      }
      throw createErr;
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "ACTIVE" },
    });

    await audit({
      userId: operatorId,
      siteId: resolvedSite.id,
      action: "MANUAL_FIRST_WEIGH_RECORDED",
      entityType: "weighbridge_transaction",
      entityId: transaction.id,
      afterData: {
        plate: booking.vehicle.plate,
        weighType: isDispatch ? "DISPATCH_TARE" : "RECEIPT_GROSS",
        weightKg: parsedWeight,
        notes: notes ?? null,
      },
    });

    return ok({
      message: `1st Weighment captured successfully for ${booking.vehicle.plate}: ${parsedWeight.toLocaleString()} kg`,
      transactionId: transaction.id,
      status: "IN_PROGRESS",
      firstWeightKg: parsedWeight,
      firstWeightType: isDispatch ? "TARE" : "GROSS",
    });
  }

  // --------------------------------------------------------------------------
  // ACTION: SECOND_WEIGH (Weigh-Out / 2nd Weight & Waybill Generation)
  // --------------------------------------------------------------------------
  if (action === "SECOND_WEIGH") {
    // Idempotency check: if this request was already finalized under this exact key
    if (idempotencyKey) {
      const existing = await prisma.weighbridgeTransaction.findFirst({
        where: { edgeTransactionId: `IDEM-${idempotencyKey}`, status: "COMPLETED" },
        include: { vehicle: true },
      });
      if (existing) {
        return ok({
          message: `Weighment finalized for ${existing.vehicle.plate}! Net Cargo: ${existing.netWeightKg.toLocaleString()} kg (idempotent replay)`,
          transaction: existing,
          waybillNumber: existing.waybillNumber,
          waybillUrl: `/waybills/${existing.id}`,
          grossWeightKg: existing.grossWeightKg,
          tareWeightKg: existing.tareWeightKg,
          netWeightKg: existing.netWeightKg,
        });
      }
    }

    const { transactionId, bookingId, weightKg, notes, mineTicketNumber } = body;
    const parsedWeight = Math.round(Number(weightKg));

    if (!parsedWeight || parsedWeight <= 0) return fail("Valid scale weight (kg) is required", 422);

    const edgeTransactionId = idempotencyKey ? `IDEM-${idempotencyKey}` : `MANUAL-${resolvedSite.code}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const txResult = await prisma.$transaction(async (tx) => {
      // Advisory xact lock strictly serializes completions per site
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resolvedSite.id}))`;

      const completionTime = new Date();

      const transaction = await tx.weighbridgeTransaction.findFirst({
        where: transactionId
          ? { id: transactionId }
          : { bookingId, status: "IN_PROGRESS" },
        include: {
          booking: { include: { order: true } },
          vehicle: true,
          driver: true,
          trailer: true,
        },
      });

      if (!transaction) {
        return { error: "Active in-progress weighment not found. Please record 1st weighment first or use Direct Entry.", status: 404 };
      }

      if (transaction.status === "COMPLETED") {
        if (idempotencyKey && transaction.edgeTransactionId === `IDEM-${idempotencyKey}`) {
          return { idempotent: true, transaction };
        }
        return { error: "This weighment transaction has already been completed.", status: 409 };
      }

      if (transaction.siteId !== resolvedSite.id) {
        return { error: `Weigh-out site (${resolvedSite.code}) must match the initial weigh-in site (${transaction.siteId})`, status: 409 };
      }

      const firstWeightKg = transaction.tareCapturedAt !== null ? transaction.tareWeightKg : transaction.grossWeightKg;
      const actualGross = Math.max(firstWeightKg, parsedWeight);
      const actualTare = Math.min(firstWeightKg, parsedWeight);
      const netWeightKg = actualGross - actualTare;
      assertWeightInvariant(actualGross, actualTare, netWeightKg);

      const legalMaxGvw = transaction.vehicle?.legalMaxGvwKg || 56000;
      const overload = actualGross > legalMaxGvw;
      const overloadVarianceKg = overload ? actualGross - legalMaxGvw : 0;

      const entryTime = transaction.entryAt ?? transaction.createdAt;
      const turnaroundSeconds = Math.max(60, Math.round((completionTime.getTime() - new Date(entryTime).getTime()) / 1000));
      const isDispatch = transaction.booking.order?.type ? transaction.booking.order.type === "DISPATCH" : true;

      // Predecessor lookup: ordered by completion time (capturedAt desc, then id desc)
      // Includes both COMPLETED and HELD records (overloaded trucks still chain)
      const prior = await getChainHead(tx, resolvedSite.id);
      const previousHash = prior.integrityHash;

      // Unique sequential waybill number generated safely inside lock
      const finalWaybillNumber = await generateNextWaybillNumber(resolvedSite.code, resolvedSite.id, tx);

      const integrityHash = computeIntegrityHash({
        edgeTransactionId,
        bookingId: transaction.bookingId,
        vehicleId: transaction.vehicleId,
        driverId: transaction.driverId,
        siteId: resolvedSite.id,
        grossWeightKg: actualGross,
        tareWeightKg: actualTare,
        netWeightKg,
        commodity: transaction.commodity,
        capturedAt: completionTime,
        waybillNumber: finalWaybillNumber,
        previousHash,
      });
      const confirmationHash = createHash("sha256").update(`${integrityHash}:${Date.now()}`).digest("hex");

      const completed = await tx.weighbridgeTransaction.update({
        where: { id: transaction.id },
        data: {
          edgeTransactionId,
          grossWeightKg: actualGross,
          tareWeightKg: actualTare,
          netWeightKg,
          grossCapturedAt: transaction.grossCapturedAt ?? completionTime,
          tareCapturedAt: transaction.tareCapturedAt ?? completionTime,
          exitAt: completionTime,
          capturedAt: completionTime,
          turnaroundSeconds,
          waybillNumber: finalWaybillNumber,
          integrityHash,
          confirmationHash,
          previousHash,
          status: "COMPLETED",
          transactionType: isDispatch ? "OUTBOUND" : "INBOUND",
          overload,
          overloadVarianceKg,
          mineTicketNumber: mineTicketNumber ?? transaction.mineTicketNumber,
          operatorId: operatorId ?? transaction.operatorId,
        },
        include: { vehicle: true },
      });

      let orderFulfilled = false;
      if (transaction.booking.orderId) {
        const synced = await syncOrderFulfillmentStatus(transaction.booking.orderId, tx);
        orderFulfilled = synced?.status === "FULFILLED";
      }

      const hasActiveOrder = Boolean(transaction.booking.orderId) && !orderFulfilled;
      await tx.booking.update({
        where: { id: transaction.bookingId },
        data: { status: hasActiveOrder ? "APPROVED" : "COMPLETED" },
      });

      await tx.vehicle.update({
        where: { id: transaction.vehicleId },
        data: { lastTareWeightKg: actualTare },
      });

      return {
        completed,
        finalWaybillNumber,
        actualGross,
        actualTare,
        netWeightKg,
        plate: transaction.vehicle.plate,
      };
    });

    if ("error" in txResult) {
      return fail(txResult.error as string, txResult.status as number);
    }
    if ("idempotent" in txResult) {
      const existing = (txResult as any).transaction;
      return ok({
        message: `Weighment finalized for ${existing.vehicle.plate}! Net Cargo: ${existing.netWeightKg.toLocaleString()} kg (idempotent replay)`,
        transaction: existing,
        waybillNumber: existing.waybillNumber,
        waybillUrl: `/waybills/${existing.id}`,
        grossWeightKg: existing.grossWeightKg,
        tareWeightKg: existing.tareWeightKg,
        netWeightKg: existing.netWeightKg,
      });
    }

    const { completed, finalWaybillNumber, actualGross, actualTare, netWeightKg, plate } = txResult as any;

    await audit({
      userId: operatorId,
      siteId: resolvedSite.id,
      action: "MANUAL_SECOND_WEIGH_COMPLETED",
      entityType: "weighbridge_transaction",
      entityId: completed.id,
      afterData: {
        waybillNumber: finalWaybillNumber,
        plate,
        grossWeightKg: actualGross,
        tareWeightKg: actualTare,
        netWeightKg,
        notes: notes ?? null,
      },
    });

    return ok({
      message: `Weighment finalized for ${plate}! Net Cargo: ${netWeightKg.toLocaleString()} kg`,
      transaction: completed,
      waybillNumber: completed.waybillNumber,
      waybillUrl: `/waybills/${completed.id}`,
      grossWeightKg: actualGross,
      tareWeightKg: actualTare,
      netWeightKg,
    });
  }

  // --------------------------------------------------------------------------
  // ACTION: DIRECT_WEIGH (Enter both 1st & 2nd weights simultaneously)
  // --------------------------------------------------------------------------
  if (action === "DIRECT_WEIGH") {
    // Idempotency check: if this direct weigh was already completed
    if (idempotencyKey) {
      const existing = await prisma.weighbridgeTransaction.findFirst({
        where: { edgeTransactionId: `IDEM-${idempotencyKey}`, status: "COMPLETED" },
        include: { vehicle: true },
      });
      if (existing) {
        return ok({
          message: `Transaction recorded for ${existing.vehicle.plate}! Net Cargo: ${existing.netWeightKg.toLocaleString()} kg (idempotent replay)`,
          transaction: existing,
          waybillNumber: existing.waybillNumber,
          waybillUrl: `/waybills/${existing.id}`,
          grossWeightKg: existing.grossWeightKg,
          tareWeightKg: existing.tareWeightKg,
          netWeightKg: existing.netWeightKg,
        });
      }
    }

    const { bookingId, weight1Kg, weight2Kg, notes, mineTicketNumber, plate, driverName, transporterName, trailer, commodity, orderId } = body;
    const w1 = Math.round(Number(weight1Kg));
    const w2 = Math.round(Number(weight2Kg));

    if (!w1 || w1 <= 0 || !w2 || w2 <= 0) return fail("Both 1st and 2nd weights (kg) must be greater than 0", 422);

    let booking;
    if (bookingId) {
      booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, driver: true, trailer: true, order: true },
      });
      if (!booking) return fail("Booking not found", 404);
    } else if (plate && plate.trim()) {
      booking = await resolveOrCreateWalkInBooking({
        siteId: resolvedSite.id,
        siteOrganisationId: resolvedSite.organisationId,
        plate,
        driverName,
        transporterName,
        trailer,
        commodity,
        orderId,
        operatorId,
      });
    } else {
      return fail("Either bookingId or vehicle registration plate is required", 422);
    }

    const actualGross = Math.max(w1, w2);
    const actualTare = Math.min(w1, w2);
    const netWeightKg = actualGross - actualTare;
    assertWeightInvariant(actualGross, actualTare, netWeightKg);

    const legalMaxGvw = booking.vehicle?.legalMaxGvwKg || 56000;
    const overload = actualGross > legalMaxGvw;
    const overloadVarianceKg = overload ? actualGross - legalMaxGvw : 0;

    const edgeTransactionId = idempotencyKey ? `IDEM-${idempotencyKey}` : `MANUAL-${resolvedSite.code}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isDispatch = booking.order?.type ? booking.order.type === "DISPATCH" : true;
    const entryTime = new Date(now.getTime() - 15 * 60 * 1000); // 15 mins turnaround fallback

    const txResult = await prisma.$transaction(async (tx) => {
      // Advisory xact lock strictly serializes completions per site
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resolvedSite.id}))`;

      const completionTime = new Date();

      // Predecessor lookup: ordered by completion time (capturedAt desc, then id desc)
      // Includes both COMPLETED and HELD records (overloaded trucks still chain)
      const prior = await getChainHead(tx, resolvedSite.id);
      const previousHash = prior.integrityHash;

      // Unique sequential waybill number generated safely inside lock
      const finalWaybillNumber = await generateNextWaybillNumber(resolvedSite.code, resolvedSite.id, tx);

      const integrityHash = computeIntegrityHash({
        edgeTransactionId,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        driverId: booking.driverId,
        siteId: resolvedSite.id,
        grossWeightKg: actualGross,
        tareWeightKg: actualTare,
        netWeightKg,
        commodity: booking.commodity,
        capturedAt: completionTime,
        waybillNumber: finalWaybillNumber,
        previousHash,
      });
      const confirmationHash = createHash("sha256").update(`${integrityHash}:${Date.now()}`).digest("hex");

      const completed = await tx.weighbridgeTransaction.create({
        data: {
          edgeTransactionId,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          trailerId: booking.trailerId,
          driverId: booking.driverId,
          siteId: resolvedSite.id,
          operatorId,
          grossWeightKg: actualGross,
          tareWeightKg: actualTare,
          netWeightKg,
          commodity: booking.commodity,
          waybillNumber: finalWaybillNumber,
          integrityHash,
          confirmationHash,
          previousHash,
          status: "COMPLETED",
          transactionType: isDispatch ? "OUTBOUND" : "INBOUND",
          overload,
          overloadVarianceKg,
          mineTicketNumber: mineTicketNumber ?? null,
          entryAt: entryTime,
          grossCapturedAt: completionTime,
          tareCapturedAt: entryTime,
          exitAt: completionTime,
          capturedAt: completionTime,
          turnaroundSeconds: 900,
        },
        include: { vehicle: true },
      });

      let orderFulfilled = false;
      if (booking.orderId) {
        const synced = await syncOrderFulfillmentStatus(booking.orderId, tx);
        orderFulfilled = synced?.status === "FULFILLED";
      }

      const hasActiveOrder = Boolean(booking.orderId) && !orderFulfilled;
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: hasActiveOrder ? "APPROVED" : "COMPLETED" },
      });

      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { lastTareWeightKg: actualTare },
      });

      return {
        completed,
        finalWaybillNumber,
      };
    });

    const { completed, finalWaybillNumber } = txResult;

    await audit({
      userId: operatorId,
      siteId: resolvedSite.id,
      action: "MANUAL_DIRECT_WEIGH_COMPLETED",
      entityType: "weighbridge_transaction",
      entityId: completed.id,
      afterData: {
        waybillNumber: finalWaybillNumber,
        plate: booking.vehicle.plate,
        grossWeightKg: actualGross,
        tareWeightKg: actualTare,
        netWeightKg,
        notes: notes ?? null,
      },
    });

    return ok({
      message: `Transaction recorded for ${booking.vehicle.plate}! Net Cargo: ${netWeightKg.toLocaleString()} kg`,
      transaction: completed,
      waybillNumber: completed.waybillNumber,
      waybillUrl: `/waybills/${completed.id}`,
      grossWeightKg: actualGross,
      tareWeightKg: actualTare,
      netWeightKg,
    });
  }

    return fail(`Unsupported action: ${action}`, 400);
  } catch (err: any) {
    console.error("MANUAL_WEIGH_ERROR:", err);
    return fail(err.message || String(err), 500);
  }
}
