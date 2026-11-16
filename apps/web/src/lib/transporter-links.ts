import { prisma } from "@/lib/prisma";

/**
 * Hauliers are shared organisations that serve several companies. A haulier may only
 * work at a company's sites when an ACTIVE MiningCompanyTransporter link exists; a
 * company's own fleet (vehicles owned by the company itself) always qualifies.
 */
export async function transporterServesCompany(transporterOrganisationId: string, companyId: string): Promise<boolean> {
  if (transporterOrganisationId === companyId) return true;
  const link = await prisma.miningCompanyTransporter.findFirst({
    where: { miningCompanyId: companyId, transporterId: transporterOrganisationId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(link);
}

/** Transporter organisation ids that may operate at a company's sites (own fleet included). */
export async function linkedTransporterIds(companyId: string): Promise<string[]> {
  const links = await prisma.miningCompanyTransporter.findMany({
    where: { miningCompanyId: companyId, status: "ACTIVE" },
    select: { transporterId: true },
  });
  return [companyId, ...links.map((l) => l.transporterId)];
}

/**
 * A vehicle may be used at a company's sites if it is owned by a linked transporter
 * (or the company) or is on an active subcontract assignment to one.
 */
export async function vehicleUsableByCompany(vehicle: { id: string; organisationId: string }, companyId: string): Promise<boolean> {
  const allowed = await linkedTransporterIds(companyId);
  if (allowed.includes(vehicle.organisationId)) return true;
  const assignment = await prisma.vehicleTransporterAssignment.findFirst({
    where: { vehicleId: vehicle.id, status: "ACTIVE", transporterOrganisationId: { in: allowed } },
    select: { id: true },
  });
  return Boolean(assignment);
}
