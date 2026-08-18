import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { normalisePlate } from "@/lib/utils";
import crypto from "crypto";

const bulkSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(500)
});

const rosterRowSchema = z.object({
  truckRegistration: z.string().min(2),
  trailer1: z.string().optional().nullable(),
  trailer2: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (auth.error) return auth.error;

  const orgId = auth.session!.user.organisationId;
  if (!orgId && auth.session!.user.role !== "ADMIN") {
    return fail("No organisation linked to this user", 403);
  }

  const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid JSON payload", 422);

  const errors: { row: number; message: string }[] = [];
  let created = 0;

  // Set the roster date to today's date (at midnight local time logic)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // We should process rows one by one or in a transaction.
  for (let i = 0; i < parsed.data.rows.length; i++) {
    const rowNumber = i + 2; // header is row 1
    const raw = parsed.data.rows[i] as Record<string, unknown>;
    
    const row = rosterRowSchema.safeParse(raw);
    if (!row.success) {
      errors.push({ row: rowNumber, message: row.error.issues[0]?.message ?? "Invalid row format" });
      continue;
    }

    const { truckRegistration, trailer1, trailer2, driverId } = row.data;
    
    // 1. Find or Auto-create Vehicle
    const normalisedPlate = normalisePlate(truckRegistration);
    let vehicle = await prisma.vehicle.findFirst({
      where: { plateNormalized: normalisedPlate, organisationId: orgId ?? undefined, deletedAt: null }
    });

    if (!vehicle) {
      // Auto-create missing vehicle
      try {
        vehicle = await prisma.vehicle.create({
          data: {
            organisationId: orgId!,
            plate: truckRegistration,
            plateNormalized: normalisedPlate,
            make: "Unknown",
            model: "Unknown",
            tareWeightKg: 15000,
            legalMaxGvwKg: 50000,
            insuranceExpiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            status: "ACTIVE"
          }
        });
      } catch (e) {
        errors.push({ row: rowNumber, message: `Failed to auto-create truck ${truckRegistration}` });
        continue;
      }
    }

    // 2. Find or Auto-create Driver
    let driverRecord = null;
    const drivers = await prisma.driver.findMany({ where: { organisationId: orgId!, deletedAt: null } });
    
    if (row.data.driverName) {
      const parts = row.data.driverName.trim().split(" ");
      const first = parts[0] || "Unknown";
      driverRecord = drivers.find(d => d.firstName.toLowerCase() === first.toLowerCase());
    } 

    if (!driverRecord) {
      // Auto-create missing driver
      try {
        const parts = row.data.driverName ? row.data.driverName.trim().split(" ") : ["Driver", "Unknown"];
        const rand = crypto.randomUUID().substring(0, 8);
        driverRecord = await prisma.driver.create({
          data: {
            organisationId: orgId!,
            firstName: parts[0] || "Driver",
            lastName: parts.slice(1).join(" ") || "Unknown",
            idNumberEncrypted: "encrypted",
            idNumberHash: `hash_${rand}`,
            rfidTag: `rfid_${rand}`,
            licenceNumber: `lic_${rand}`,
            licenceExpiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            consentCapturedAt: new Date()
          }
        });
      } catch (e) {
        errors.push({ row: rowNumber, message: `Failed to auto-create driver` });
        continue;
      }
    }

    // 3. Find or Auto-create Trailers
    let t1Record = null;
    if (trailer1) {
      t1Record = await prisma.trailer.findFirst({
        where: { trailerId: trailer1.toUpperCase(), vehicle: { organisationId: orgId! } }
      });
      if (!t1Record) {
        t1Record = await prisma.trailer.create({
          data: { trailerId: trailer1.toUpperCase(), vehicleId: vehicle.id }
        }).catch(() => null);
      }
    }

    let t2Record = null;
    if (trailer2) {
      t2Record = await prisma.trailer.findFirst({
        where: { trailerId: trailer2.toUpperCase(), vehicle: { organisationId: orgId! } }
      });
      if (!t2Record) {
        t2Record = await prisma.trailer.create({
          data: { trailerId: trailer2.toUpperCase(), vehicleId: vehicle.id }
        }).catch(() => null);
      }
    }

    // 4. Create or Update Fleet Roster
    try {
      await prisma.fleetRoster.upsert({
        where: {
          vehicleId_rosterDate: {
            vehicleId: vehicle.id,
            rosterDate: today
          }
        },
        update: {
          driverId: driverRecord.id,
          trailer1Id: t1Record?.id ?? null,
          trailer2Id: t2Record?.id ?? null,
        },
        create: {
          organisationId: orgId!,
          vehicleId: vehicle.id,
          driverId: driverRecord.id,
          trailer1Id: t1Record?.id ?? null,
          trailer2Id: t2Record?.id ?? null,
          rosterDate: today
        }
      });
      created++;
    } catch (e) {
      errors.push({ row: rowNumber, message: "Failed to save roster entry for this vehicle" });
    }
  }

  return ok({ created, errors });
}
