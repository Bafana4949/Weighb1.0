import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const { id } = await params;
  const scope = a.session!.user.organisationId ? { clientMiningCompanies: { some: { miningCompanyId: a.session!.user.organisationId } } } : {};
  
  const before = await prisma.organisation.findFirst({ 
    where: { id, type: "HAULIER", deletedAt: null, ...scope }, 
    include: { users: true } 
  });
  
  if (!before) return fail("Transporter not found", 404);
  if (before.isActive) return fail("This transporter is already active", 409);

  const [organisation] = await prisma.$transaction([
    prisma.organisation.update({ where: { id }, data: { isActive: true } }),
    prisma.user.updateMany({ where: { organisationId: id, status: "SUSPENDED" }, data: { status: "ACTIVE" } })
  ]);

  await audit({ 
    userId: a.session!.user.id, 
    action: "TRANSPORTER_ACTIVATED", 
    entityType: "organisation", 
    entityId: id, 
    beforeData: { isActive: false }, 
    afterData: { isActive: true } 
  });
  
  return ok(organisation);
}
