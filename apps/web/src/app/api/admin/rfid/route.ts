import { z } from "zod";
import { UserRole, RfidCredentialType, RfidCredentialStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const rfidSchema = z.object({
  uid: z.string().min(4).max(60),
  displayCode: z.string().max(60).optional(),
  credentialType: z.enum([RfidCredentialType.DRIVER, RfidCredentialType.TRUCK]),
  organisationId: z.string().uuid(),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  
  const parsed = rfidSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid RFID data", 422);

  // Tenant isolation check
  if (!isSuperAdmin) {
    if (parsed.data.organisationId !== a.session!.user.organisationId) {
      return fail("You can only issue RFIDs for your own organisation", 403);
    }
  }

  // Ensure driver or vehicle belongs to organisation if provided
  if (parsed.data.credentialType === RfidCredentialType.DRIVER) {
    if (!parsed.data.driverId) return fail("Driver ID is required for Driver RFIDs", 400);
    const driver = await prisma.driver.findUnique({ where: { id: parsed.data.driverId } });
    if (!driver || driver.organisationId !== parsed.data.organisationId) {
      return fail("Invalid driver selected for this organisation", 400);
    }
  }

  if (parsed.data.credentialType === RfidCredentialType.TRUCK) {
    if (!parsed.data.vehicleId) return fail("Vehicle ID is required for Vehicle RFIDs", 400);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
    if (!vehicle || vehicle.organisationId !== parsed.data.organisationId) {
      return fail("Invalid vehicle selected for this organisation", 400);
    }
  }

  try {
    const credential = await prisma.rfidCredential.create({
      data: {
        uid: parsed.data.uid,
        displayCode: parsed.data.displayCode || null,
        credentialType: parsed.data.credentialType,
        status: RfidCredentialStatus.ACTIVE,
        organisationId: parsed.data.organisationId,
        driverId: parsed.data.credentialType === RfidCredentialType.DRIVER ? parsed.data.driverId : null,
        vehicleId: parsed.data.credentialType === RfidCredentialType.TRUCK ? parsed.data.vehicleId : null,
        createdById: a.session!.user.id,
      },
      include: {
        organisation: { select: { name: true } },
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plate: true } },
      }
    });

    await audit({
      userId: a.session!.user.id,
      action: "RFID_ISSUED",
      entityType: "rfid",
      entityId: credential.id,
      afterData: { ...parsed.data },
    });

    return ok(credential, 201);
  } catch (error: any) {
    console.error("RFID issue error:", error);
    if (error.code === "P2002") {
      return fail("An RFID with this UID already exists", 409);
    }
    return fail("An error occurred while issuing the RFID", 500);
  }
}
