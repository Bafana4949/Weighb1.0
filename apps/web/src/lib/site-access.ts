import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { TenantScopeError, type UserContext } from "@/lib/access";

/**
 * Site-level access on top of company scoping.
 *
 * - Platform super admin: every site.
 * - Staff (ADMIN / OPERATOR / SECURITY) with no UserSiteAccess rows: every site of
 *   their company — this is the Company Admin case.
 * - Staff with one or more UserSiteAccess rows: only those sites. An ADMIN in this
 *   state is a Site Admin.
 *
 * Fails closed: a non-super-admin without a company gets a TenantScopeError.
 */
export type AccessContext =
  | { kind: "platform" }
  | { kind: "company"; organisationId: string }
  | { kind: "sites"; organisationId: string; siteIds: string[] };

type SessionUser = NonNullable<UserContext> & { id?: string | null };

export async function loadAccessContext(user: SessionUser): Promise<AccessContext> {
  if (isPlatformSuperAdmin(user)) return { kind: "platform" };
  if (!user?.organisationId) throw new TenantScopeError("Tenant organisation required for non-superadmin access");
  if (!user.id) throw new TenantScopeError("User id required to resolve site access");
  const rows = await prisma.userSiteAccess.findMany({
    where: { userId: user.id, site: { organisationId: user.organisationId } },
    select: { siteId: true },
  });
  if (rows.length === 0) return { kind: "company", organisationId: user.organisationId };
  return { kind: "sites", organisationId: user.organisationId, siteIds: rows.map((r) => r.siteId) };
}

/** Prisma where for the Site model. */
export function siteWhere(ctx: AccessContext): Prisma.SiteWhereInput {
  if (ctx.kind === "platform") return {};
  if (ctx.kind === "company") return { organisationId: ctx.organisationId };
  return { organisationId: ctx.organisationId, id: { in: ctx.siteIds } };
}

/** Prisma where for models with a `site` relation (transactions, bookings, incidents, devices...). */
export function viaSiteWhere(ctx: AccessContext): { site?: Prisma.SiteWhereInput } {
  return ctx.kind === "platform" ? {} : { site: siteWhere(ctx) };
}

export function contextAllowsSite(ctx: AccessContext, site: { id: string; organisationId: string }): boolean {
  if (ctx.kind === "platform") return true;
  if (site.organisationId !== ctx.organisationId) return false;
  return ctx.kind === "company" || ctx.siteIds.includes(site.id);
}

export async function canAccessSite(user: SessionUser, site: { id: string; organisationId: string }): Promise<boolean> {
  try {
    return contextAllowsSite(await loadAccessContext(user), site);
  } catch (error) {
    if (error instanceof TenantScopeError) return false;
    throw error;
  }
}

export function isSiteRestricted(ctx: AccessContext): boolean {
  return ctx.kind === "sites";
}

/** Human label for the shell: "Platform Super Admin", "Company Admin", "Site Admin", ... */
export function roleLabel(role: string, ctx: AccessContext | null): string {
  if (ctx?.kind === "platform") return "Platform Super Admin";
  if (role === "ADMIN") return ctx?.kind === "sites" ? "Site Admin" : "Company Admin";
  if (role === "OPERATOR") return "Operator";
  if (role === "SECURITY") return "Security";
  if (role === "TRANSPORTER") return "Transporter";
  return role;
}

/** Transporters see their own loads; staff see transactions at sites they can access. */
export async function canViewTransaction(
  user: SessionUser & { role?: string | null },
  tx: { site: { id: string; organisationId: string }; booking: { transporterOrganisationId: string } },
): Promise<boolean> {
  if (user.role === "TRANSPORTER") return Boolean(user.organisationId) && tx.booking.transporterOrganisationId === user.organisationId;
  return canAccessSite(user, tx.site);
}
