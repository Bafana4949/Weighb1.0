import type { UserRole, PlatformRole } from "@prisma/client";
import { isPlatformSuperAdmin } from "./permissions";

export class TenantScopeError extends Error {
  constructor(message = "Tenant scope required but organisation is null or invalid") {
    super(message);
    this.name = "TenantScopeError";
  }
}

/** Pure role predicate kept separate from Next.js/Auth imports for easy testing. */
export function roleAllowed(role: UserRole, roles: readonly UserRole[]): boolean {
  return roles.includes(role);
}

/**
 * Tenant filter. Strictly single-argument. Fails closed: throws rather than degrading to {} —
 * a missing org is a bug, not a wildcard. Never accepts a user object, never returns {}.
 */
export function mineScope(organisationId: string | null | undefined): { organisationId: string } {
  if (!organisationId || typeof organisationId !== "string") {
    throw new TenantScopeError("Tenant scope required but organisation is null");
  }
  return { organisationId };
}

/**
 * Unscoped access. Callable ONLY after an explicit isPlatformSuperAdmin check.
 */
export function platformWideScope(): Record<string, never> {
  return {};
}

export type AccessScope =
  | { kind: "platform" }
  | { kind: "tenant"; organisationId: string };

export type UserContext = {
  role?: UserRole | null;
  organisationId?: string | null;
  platformRole?: PlatformRole | null;
} | null | undefined;

export function resolveScope(user: UserContext): AccessScope {
  if (isPlatformSuperAdmin(user)) return { kind: "platform" };
  if (!user?.organisationId) throw new TenantScopeError("Tenant organisation required for non-superadmin access");
  return { kind: "tenant", organisationId: user.organisationId };
}

/**
 * Returns Prisma where clause for an entity directly owned by an organisation.
 * If user is Platform Super Admin -> {} (sees all tenants).
 * If user is Tenant Admin / Operator -> { organisationId: user.organisationId }.
 * If non-super-admin with missing org -> throws TenantScopeError (fail-closed).
 */
export function userScope(user: UserContext): { organisationId: string } | Record<string, never> {
  if (isPlatformSuperAdmin(user)) return platformWideScope();
  if (!user?.organisationId) throw new TenantScopeError("Tenant organisation required for non-superadmin access");
  return { organisationId: user.organisationId };
}

/**
 * Returns Prisma where clause for an entity scoped via a `site` relation.
 * If user is Platform Super Admin -> {} (sees all sites).
 * If user is Tenant Admin / Operator -> { site: { organisationId: user.organisationId } }.
 * If non-super-admin with missing org -> throws TenantScopeError (fail-closed).
 */
export function userSiteScope(user: UserContext): { site: { organisationId: string } } | Record<string, never> {
  if (isPlatformSuperAdmin(user)) return platformWideScope();
  if (!user?.organisationId) throw new TenantScopeError("Tenant organisation required for non-superadmin access");
  return { site: { organisationId: user.organisationId } };
}

/**
 * Returns Prisma where clause for transactions/bookings scoped to a transporter organisation.
 * Throws TenantScopeError if organisationId is missing.
 */
export function transporterScope(user: UserContext): { booking: { transporterOrganisationId: string } } {
  if (!user?.organisationId) throw new TenantScopeError("Transporter organisation required for transporter access");
  return { booking: { transporterOrganisationId: user.organisationId } };
}

/**
 * Handler wrapper that catches TenantScopeError thrown inside route queries
 * and returns a clean 403 response instead of an unhandled 500 error.
 */
export function withScopeErrors<T extends (...args: any[]) => Promise<any>>(
  handler: T
): (...args: Parameters<T>) => Promise<Response> {
  return async (...args: Parameters<T>): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof TenantScopeError) {
        return new Response(JSON.stringify({ success: false, data: null, error: "Tenant organisation scope required" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      throw e;
    }
  };
}
