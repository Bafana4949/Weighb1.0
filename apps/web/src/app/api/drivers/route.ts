import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSensitive,hashValue } from "@/lib/crypto";
import { driverSchema } from "@/lib/validation";
import { fail,ok,requireRole } from "@/lib/api";
import { assertOrganisationActive, isPlatformSuperAdmin } from "@/lib/permissions";

export async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const requestedOrg = url.searchParams.get("org");
  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const org = isSuperAdmin ? requestedOrg : a.session!.user.organisationId;
  const drivers = await prisma.driver.findMany({
    where: { deletedAt: null, ...(org ? { organisationId: org } : {}) },
    include: { organisation: true },
    orderBy: { lastName: "asc" },
  });
  return ok(drivers.map(({ idNumberEncrypted, idNumberHash, ...safe }) => safe));
}

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const parsed = driverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid driver", 422);

  const organisationId = parsed.data.organisationId;
  if (!organisationId) return fail("Organisation is required", 422);

  if (!isPlatformSuperAdmin(a.session!.user) && a.session!.user.organisationId && organisationId !== a.session!.user.organisationId) {
    return fail("Forbidden: You can only register drivers for your own organisation", 403);
  }

  const ownerOrg = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!ownerOrg) return fail("Organisation not found", 404);

  const orgStatusError = assertOrganisationActive(ownerOrg);
  if (orgStatusError) return fail(orgStatusError, 403);

  const { idNumber, consent, rfidTag, ...data } = parsed.data;
  try {
    const driver = await prisma.driver.create({
      data: {
        ...data,
        organisationId,
        rfidTag: rfidTag?.trim() || null,
        idNumberEncrypted: encryptSensitive(idNumber),
        idNumberHash: hashValue(idNumber),
        consentCapturedAt: new Date(),
      },
    });
    const { idNumberEncrypted, idNumberHash, ...safe } = driver;
    return ok(safe, 201);
  } catch (err: any) {
    return fail("Driver ID, RFID tag, or licence number is already registered", 409);
  }
}

