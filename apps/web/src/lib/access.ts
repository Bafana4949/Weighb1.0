import type { UserRole } from "@prisma/client";

/** Pure role predicate kept separate from Next.js/Auth imports for easy testing. */
export function roleAllowed(role: UserRole, roles: readonly UserRole[]): boolean {
  return roles.includes(role);
}

/**
 * A super-admin (organisationId === null) sees everything. An admin scoped to
 * a mining company only ever sees that company's data. Spread the result into
 * a Prisma `where` directly (for entities with organisationId), or nest it
 * under a relation key (e.g. `{ site: mineScope(orgId) }`) for entities that
 * only relate through siteId.
 */
export function mineScope(organisationId: string | null): { organisationId: string } | Record<string, never> {
  return organisationId ? { organisationId } : {};
}
