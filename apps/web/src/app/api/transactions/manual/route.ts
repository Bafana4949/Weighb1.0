import { createHash } from "crypto";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorCanAccessSite, fail, ok, requirePermission, requireSiteOrRole, type Actor } from "@/lib/api";
import { linkedTransporterIds } from "@/lib/transporter-links";
import { loadSiteCapabilities, manualEntryError, type WeightSource } from "@/lib/site-capabilities";
import { logger } from "@/lib/logger";
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

/** Raised for walk-in problems whose message is safe to show the operator. */
class WalkInError extends Error {}

/**
 * Walk-in weighing: a truck without a pre-booking. Everything is resolved inside the
 * site's company — its own fleet plus hauliers it is contracted to — so a typed
 * plate can never attach a load to another tenant's vehicle or transporter.
 */
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
  if (!operatorId) throw new WalkInError("Walk-in weighments must be recorded by a signed-in operator");
  const plateClean = plate.trim().toUpperCase();
  const plateNorm = plateClean.replace(/[^A-Z0-9]/g, "");
  if (plateNorm.length < 3) throw new WalkInError("Enter a valid registration plate");

  const order = orderId
    ? await prisma.weighbridgeOrder.findFirst({ where: { id: orderId, siteId, status: "ACTIVE" }, include: { productRef: true } })
    : null;
  if (orderId && !order) throw new WalkInError("Selected order is not active at this site");
  const commodityName = order?.productRef?.name ?? order?.product ?? commodity?.trim();
  if (!commodityName) throw new WalkInError("Select an order or enter the product being weighed");

  const allowedOwners = await linkedTransporterIds(siteOrganisationId);

  // 1. Transporter: a haulier contracted to this company, the company itself, or a new
  //    haulier registered and linked on the spot (audited).
  let transporterOrg: { id: string; name: string } | null = null;
  const tName = transporterName?.trim();
  if (tName) {
    transporterOrg = await prisma.organisation.findFirst({
      where: { id: { in: allowedOwners }, name: { equals: tName, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!transporterOrg) {
      transporterOrg = await prisma.organisation.create({ data: { name: tName, type: "HAULIER", status: "ACTIVE", isActive: true }, select: { id: true, name: true } });
      await prisma.miningCompanyTransporter.create({ data: { miningCompanyId: siteOrganisationId, transporterId: transporterOrg.id, status: "ACTIVE" } });
      await audit({ userId: operatorId, siteId, organisationId: siteOrganisationId, action: "WALK_IN_TRANSPORTER_REGISTERED", entityType: "organisation", entityId: transporterOrg.id, afterData: { name: tName } });
      allowedOwners.push(transporterOrg.id);
    }
  }

  // 2. Vehicle: only vehicles of permitted owners match the plate.
  let vehicle = await prisma.vehicle.findFirst({
    where: {
      plateNormalized: plateNorm,
      deletedAt: null,
      OR: [{ organisationId: { in: allowedOwners } }, { transporterAssignments: { some: { status: "ACTIVE", transporterOrganisationId: { in: allowedOwners } } } }],
    },
  });
  const ownerId = transporterOrg?.id ?? vehicle?.organisationId ?? siteOrganisationId;
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        organisationId: ownerId,
        plate: plateClean,
        plateNormalized: plateNorm,
        make: "Walk-in",
        model: "Details to be completed",
        tareWeightKg: 0,
        legalMaxGvwKg: 56000,
        insuranceExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        status: "ACTIVE",
      },
    });
    await audit({ userId: operatorId, siteId, organisationId: siteOrganisationId, action: "WALK_IN_VEHICLE_REGISTERED", entityType: "vehicle", entityId: vehicle.id, afterData: { plate: plateClean, organisationId: ownerId } });
  }
  const bookingOwnerId = transporterOrg?.id ?? vehicle.organisationId;

  // 3. Driver within the transporter.
  const dParts = (driverName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = dParts[0] || "Unnamed";
  const lastName = dParts.slice(1).join(" ") || "Driver";
  let driver = await prisma.driver.findFirst({
    where: { organisationId: bookingOwnerId, firstName: { equals: firstName, mode: "insensitive" }, lastName: { equals: lastName, mode: "insensitive" }, deletedAt: null },
  });
  if (driver?.blacklistStatus) throw new WalkInError(`${driver.firstName} ${driver.lastName} is blacklisted and cannot be weighed`);
  if (!driver) {
    const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
    driver = await prisma.driver.create({
      data: {
        organisationId: bookingOwnerId,
        firstName,
        lastName,
        idNumberEncrypted: "N/A",
        idNumberHash: `walkin_${Date.now()}_${rand}`,
        licenceNumber: `WALKIN-${rand}`,
        licenceExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        consentCapturedAt: new Date(),
      },
    });
  }

  // 4. Trailer: reuse only if it is on this vehicle or a permitted owner's vehicle.
  let trailerRecord = null;
  const tClean = trailer?.trim().toUpperCase();
  if (tClean) {
    const existing = await prisma.trailer.findFirst({ where: { trailerId: tClean }, include: { vehicle: { select: { organisationId: true } } } });
    if (!existing) {
      trailerRecord = await prisma.trailer.create({ data: { trailerId: tClean, registrationNo: null, vehicleId: vehicle.id } });
    } else if (existing.vehicleId === vehicle.id || (existing.vehicle && allowedOwners.includes(existing.vehicle.organisationId))) {
      trailerRecord = existing;
    } else {
      logger.warn("walk_in_trailer_conflict", { site_id: siteId, trailer: tClean });
    }
  }

  const ref = `WALK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const token = `JT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const payloadKg = vehicle.tareWeightKg > 0 ? Math.max(0, vehicle.legalMaxGvwKg - vehicle.tareWeightKg) : 0;

  return await prisma.booking.create({
    data: {
      reference: ref,
      journeyToken: token,
      transporterOrganisationId: bookingOwnerId,
      siteId,
      vehicleId: vehicle.id,
      driverId: driver.id,
      trailerId: trailerRecord?.id ?? null,
      orderId: order?.id ?? null,
      commodity: commodityName,
      targetTonnageKg: payloadKg,
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 24 * 3600 * 1000),
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: operatorId,
      approvalReason: "Manual walk-in weighment authorised by operator",
      createdById: operatorId,
    },
    include: { vehicle: true, driver: true, trailer: true, order: true },
  });
}

/**
 * Applies the site tier's manual-entry policy. Edge controllers read the indicator,
 * so their weights are INDICATOR by definition; browser clients state the source.
 */
async function weightPolicy(actor: Actor, siteId: string, body: any): Promise<{ error: Response | null; source: WeightSource; reason: string | null; flagged: boolean }> {
  if (actor.type !== "user") return { error: null, source: "INDICATOR", reason: null, flagged: false };
  const source: WeightSource = body?.weightSource === "INDICATOR" ? "INDICATOR" : "MANUAL";
  const reason = typeof body?.manualReason === "string" ? body.manualReason.trim().slice(0, 500) : null;
  const caps = await loadSiteCapabilities(siteId);
  if (!caps) return { error: fail("Site not found", 404), source, reason, flagged: false };
  const needsOverride = source === "MANUAL" && caps.manualEntryPolicy === "SUPERVISOR_OVERRIDE";
  const hasOverride = needsOverride ? !(await requirePermission("transaction.override")).error : false;
  const error = manualEntryError(caps, source, reason, hasOverride);
  return { error: error ? fail(error, 422) : null, source, reason, flagged: source === "MANUAL" && caps.manualEntryPolicy !== "PRIMARY" };
}

/** Typed weights at automated sites become reviewable exceptions. */
async function flagManualWeight(siteId: string, operatorId: string | null, transactionId: string, bookingId: string, reason: string | null, weights: Record<string, number>) {
  await prisma.incident.create({
    data: {
      siteId,
      transactionId,
      bookingId,
      type: "MANUAL_OVERRIDE",
      severity: "MEDIUM",
      title: "Weight entered by hand",
      description: `Operator typed the weight instead of reading the indicator. Reason: ${reason ?? "—"}`,
      anomalyScore: 10,
    },
  });
  await audit({ userId: operatorId, siteId, action: "MANUAL_WEIGHT_OVERRIDE", entityType: "weighbridge_transaction", entityId: transactionId, reason, afterData: weights });
}

export async function GET(request: NextRequest) {
  const authCheck = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (authCheck.error) return authCheck.error;

  const site = request.nextUrl.searchParams.get("site");
  if (!site) return fail("site is required", 422);

  const resolvedSite = await prisma.site.findFirst({ where: siteIdentifierWhere(site) });
  if (!resolvedSite) return fail("Site not found", 404);

  if (!(await actorCanAccessSite(authCheck.actor!, resolvedSite))) {
    return fail("Forbidden: You do not have access to this site's weighments", 403);
  }

  // 1. Fetch transactions currently in progress (captured 1st weight, awaiting 2nd weight)
  const inProgress = await prisma.weighbridgeTransaction.findMany({
    where: {
      siteId: resolvedSite.id,
      status: "IN_PROGRESS",
      OR: [
        {
          booking: {
            orderId: null,
          },
        },
        {
          booking: {
            order: {
              status: "ACTIVE",
            },
          },
        },
      ],
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
      presetTareWeightKg: (t.booking.order as any)?.presetTareWeightKg ?? null,
      presetGrossWeightKg: (t.booking.order as any)?.presetGrossWeightKg ?? null,
      useConstantTare: (t.booking.order as any)?.useConstantTare ?? false,
      useConstantGross: (t.booking.order as any)?.useConstantGross ?? false,
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

    if (!(await actorCanAccessSite(authCheck.actor!, resolvedSite))) {
      return fail("Forbidden: You do not have operator permissions for this site", 403);
    }
    if (!resolvedSite.isActive) return fail("This site is not active", 409);

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
    const wp = await weightPolicy(authCheck.actor!, resolvedSite.id, body);
    if (wp.error) return wp.error;

    let booking;
    if (bookingId) {
      booking = await prisma.booking.findFirst({
        where: { id: bookingId, siteId: resolvedSite.id, status: { in: ["APPROVED", "ACTIVE"] } },
        include: { vehicle: true, driver: true, trailer: true, order: true },
      });
      if (!booking) return fail("Booking not found or not approved for this site", 404);
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
        weightSource: wp.source,
        notes: notes ?? null,
      },
    });
    if (wp.flagged) await flagManualWeight(resolvedSite.id, operatorId, transaction.id, booking.id, wp.reason, { firstWeightKg: parsedWeight });

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
    const wp = await weightPolicy(authCheck.actor!, resolvedSite.id, body);
    if (wp.error) return wp.error;

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
        weightSource: wp.source,
        notes: notes ?? null,
      },
    });
    if (wp.flagged) await flagManualWeight(resolvedSite.id, operatorId, completed.id, completed.bookingId, wp.reason, { grossWeightKg: actualGross, tareWeightKg: actualTare });

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
    const wp = await weightPolicy(authCheck.actor!, resolvedSite.id, body);
    if (wp.error) return wp.error;

    let booking;
    if (bookingId) {
      booking = await prisma.booking.findFirst({
        where: { id: bookingId, siteId: resolvedSite.id, status: { in: ["APPROVED", "ACTIVE"] } },
        include: { vehicle: true, driver: true, trailer: true, order: true },
      });
      if (!booking) return fail("Booking not found or not approved for this site", 404);
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
        weightSource: wp.source,
        notes: notes ?? null,
      },
    });
    if (wp.flagged) await flagManualWeight(resolvedSite.id, operatorId, completed.id, booking.id, wp.reason, { grossWeightKg: actualGross, tareWeightKg: actualTare });

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
    if (err instanceof WalkInError) return fail(err.message, 422);
    logger.error("manual_weigh_error", { message: err instanceof Error ? err.message : String(err) });
    return fail("The weighment could not be recorded. Please try again.", 500);
  }
}
