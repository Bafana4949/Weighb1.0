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
 * Tenant filter. Fails closed: throws rather than degrading to {} — a missing org is a bug, not a wildcard.
 */
export function mineScope(organisationId: string | null | undefined): { organisationId: string } {
  if (!organisationId) {
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

export function resolveScope(user: { role?: UserRole | null; organisationId?: string | null; platformRole?: PlatformRole | null } | null | undefined): AccessScope {
  if (isPlatformSuperAdmin(user)) return { kind: "platform" };
  if (!user?.organisationId) throw new TenantScopeError("Tenant organisation required for non-superadmin access");
  return { kind: "tenant", organisationId: user.organisationId };
}

/**
 * Helper to get Prisma where clause for a user:
 * If platform super-admin -> {} (unscoped)
 * Otherwise -> { organisationId: user.organisationId } (strictly scoped)
 */
export function userScope(user: { role?: UserRole | null; organisationId?: string | null; platformRole?: PlatformRole | null } | null | undefined): { organisationId: string } | Record<string, never> {
  if (isPlatformSuperAdmin(user)) return platformWideScope();
  return mineScope(user?.organisationId);
}
