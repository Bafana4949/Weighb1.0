import type { ClientOrganisationStatus,PlatformRole,UserRole } from "@prisma/client";
import { BUILT_IN_ROLE_PERMISSIONS } from "@weighbridge/database/src/rbac-catalogue";

/**
 * Pure predicate, kept free of Next.js/Auth imports (mirrors lib/access.ts)
 * so it can be used in tests and any lightweight context without dragging in
 * the full next-auth/next/server chain. platformRole is the source of truth
 * going forward, but falls back to the legacy convention (ADMIN with no
 * organisation) so this stays correct even for rows that predate the
 * platform_role column or haven't been backfilled.
 */
export function isPlatformSuperAdmin(user: { role?: UserRole | null; organisationId?: string | null; platformRole?: PlatformRole | null } | null | undefined): boolean {
  if (!user) return false;
  return user.platformRole === "PLATFORM_SUPER_ADMIN";
}

/**
 * Returns a human-readable rejection reason if the organisation cannot
 * transact (suspended/archived), or null if it's fine to proceed. Callers
 * creating bookings/vehicles/drivers on behalf of a client organisation
 * should check this before writing — otherwise a SUSPENDED/ARCHIVED status
 * is cosmetic rather than enforced.
 */
export function assertOrganisationActive(organisation: { status: ClientOrganisationStatus }): string | null {
  if (organisation.status === "SUSPENDED") return "This client organisation is suspended and cannot transact. Contact the platform administrator.";
  if (organisation.status === "ARCHIVED") return "This client organisation is archived and cannot transact.";
  return null;
}

/** Built-in permission set used when a user has no custom role assignments. */
const BASE_ROLE_PERMISSIONS: Record<UserRole, readonly string[] | null> = {
  ADMIN: BUILT_IN_ROLE_PERMISSIONS.CLIENT_ADMIN ?? null,
  OPERATOR: BUILT_IN_ROLE_PERMISSIONS.OPERATOR ?? [],
  SECURITY: [...(BUILT_IN_ROLE_PERMISSIONS.VIEWER ?? []), "incident.create", "transaction.print", "hardware.view"],
  TRANSPORTER: ["booking.view", "booking.create", "vehicle.view", "driver.view", "transaction.view", "transaction.print", "report.view"],
};

export function basePermissionAllows(role: UserRole, permissionKey: string): boolean {
  const granted = BASE_ROLE_PERMISSIONS[role];
  return granted === null || granted.includes(permissionKey);
}
