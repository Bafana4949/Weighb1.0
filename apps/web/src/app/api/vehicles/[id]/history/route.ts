import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";

export const GET = withScopeErrors(async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) return fail("Vehicle not found", 404);

  const isSuper = isPlatformSuperAdmin(a.session!.user);
  const userOrgId = a.session!.user.organisationId;

  if (!isSuper) {
    if (a.session!.user.role === "TRANSPORTER") {
      if (vehicle.organisationId !== userOrgId) return fail("Vehicle not found", 404);
    } else {
      // Client admin/operator: vehicle must belong to org or have operated at their sites
      if (vehicle.organisationId !== userOrgId) {
        const operatedAtOrgSite = await prisma.weighbridgeTransaction.count({
          where: { vehicleId: id, site: { organisationId: userOrgId! } },
        });
        if (operatedAtOrgSite === 0) return fail("Vehicle not found", 404);
      }
    }
  }

  const txScope = isSuper
    ? {}
    : a.session!.user.role === "TRANSPORTER"
      ? { booking: { transporterOrganisationId: userOrgId! } }
      : { site: { organisationId: userOrgId! } };

  const data = await prisma.weighbridgeTransaction.findMany({
    where: { vehicleId: id, ...txScope },
    include: { site: true, booking: true },
    orderBy: { capturedAt: "desc" },
  });

  return ok(data);
});
