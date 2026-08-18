import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { normalisePlate } from "@/lib/utils";
import { trailerSchema } from "@/lib/validation";

const bulkSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(500)
});

// We need a specific schema for the CSV row that takes vehiclePlate instead of vehicleId
const trailerRowSchema = z.object({
  vehiclePlate: z.string().min(5).max(20),
  trailerId: z.string().min(2).max(30),
  registrationNo: z.string().max(20).optional().nullable(),
  type: z.string().max(60).optional().nullable(),
  tareWeightKg: z.number().int().min(500).max(30_000).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (auth.error) return auth.error;

  const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid CSV payload", 422);

  const errors: { row: number; message: string }[] = [];
  let created = 0;

  // Optimisation: Cache vehicle lookups to avoid hammering the DB for the same plate in multiple rows
  const vehicleCache = new Map<string, string | null>();

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const rowNumber = i + 2; // header is row 1
    const raw = parsed.data.rows[i] as Record<string, unknown>;
    
    // Parse numeric fields properly from CSV strings
    const row = trailerRowSchema.safeParse({
      ...raw,
      tareWeightKg: raw.tareWeightKg ? Number(raw.tareWeightKg) : undefined,
    });

    if (!row.success) {
      errors.push({ row: rowNumber, message: row.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }

    const normalisedPlate = normalisePlate(row.data.vehiclePlate);
    
    // Lookup vehicle ID by plate
    let vehicleId = vehicleCache.get(normalisedPlate);
    if (vehicleId === undefined) {
      // Fetch from DB
      const queryParams: any = { plateNormalized: normalisedPlate, deletedAt: null };
      
      // If transporter, they can only add trailers to their own vehicles
      if (auth.session!.user.role === "TRANSPORTER") {
        queryParams.organisationId = auth.session!.user.organisationId;
      }
      
      const vehicle = await prisma.vehicle.findFirst({
        where: queryParams,
        select: { id: true }
      });
      
      if (vehicle) {
        vehicleId = vehicle.id;
        vehicleCache.set(normalisedPlate, vehicle.id);
      } else {
        vehicleId = null;
        vehicleCache.set(normalisedPlate, null);
      }
    }

    if (!vehicleId) {
      errors.push({ 
        row: rowNumber, 
        message: auth.session!.user.role === "TRANSPORTER" 
          ? `Vehicle '${row.data.vehiclePlate}' not found in your fleet`
          : `Vehicle '${row.data.vehiclePlate}' not found`
      });
      continue;
    }

    try {
      await prisma.trailer.create({
        data: {
          vehicleId: vehicleId,
          trailerId: row.data.trailerId.toUpperCase(),
          registrationNo: row.data.registrationNo ? row.data.registrationNo.toUpperCase() : null,
          type: row.data.type || null,
          tareWeightKg: row.data.tareWeightKg || null,
        }
      });
      created++;
    } catch (e) {
      errors.push({ row: rowNumber, message: "Trailer ID may already exist for this vehicle" });
    }
  }

  return ok({ created, errors });
}
