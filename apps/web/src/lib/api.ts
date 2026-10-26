import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { UserRole } from "@prisma/client";
import { BUILT_IN_ROLE_PERMISSIONS } from "@weighbridge/database/src/rbac-catalogue";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roleAllowed } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { hashEdgeKey, legacySiteKeyMatches, looksLikeEdgeKey } from "@/lib/edge-auth";

/** Never serialised to a client, whatever a route happens to include. */
const SECRET_FIELDS = new Set(["passwordHash", "idNumberEncrypted", "idNumberHash", "edgeKeyHash", "tokenHash"]);

export function scrubSecrets(key: string, value: unknown): unknown {
  return SECRET_FIELDS.has(key) ? undefined : value;
}

export function ok<T>(data: T, status = 200, meta?: { page: number; total: number; limit: number }) {
  return new NextResponse(JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }, scrubSecrets), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

export { roleAllowed, withScopeErrors } from "@/lib/access";

/**
 * The JWT is only a hint: role, company and status are re-read from the database on
 * every API call, so suspending a user or company (or changing a role) takes effect
 * immediately instead of when the 8-hour token expires.
 */
export async function currentSession(): Promise<{ session: Session | null; reason?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { session: null };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, status: true, deletedAt: true, organisationId: true, platformRole: true, organisation: { select: { status: true, name: true } } },
  });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return { session: null, reason: "Account is not active" };
  if (user.organisation && (user.organisation.status === "SUSPENDED" || user.organisation.status === "ARCHIVED")) {
    return { session: null, reason: "Company account is suspended" };
  }
  // Only the platform super admin operates without a company. Refusing every other
  // company-less account here makes the many `organisationId`-based checks fail closed.
  if (!user.organisationId && user.platformRole !== "PLATFORM_SUPER_ADMIN") {
    return { session: null, reason: "Account is not linked to a company" };
  }
  session.user.role = user.role;
  session.user.organisationId = user.organisationId;
  session.user.platformRole = user.platformRole;
  session.user.organisationName = user.organisation?.name ?? null;
  return { session };
}

export async function requireRole(roles: UserRole[]) {
  const { session, reason } = await currentSession();
  if (!session?.user?.id || !session.user.role) return { error: fail(reason ?? "Authentication required", 401), session: null };
  if (!roleAllowed(session.user.role, roles)) return { error: fail("Insufficient permissions", 403), session: null };
  return { error: null, session };
}

export async function requirePlatformSuperAdmin() {
  const result = await requireRole(["ADMIN"] as UserRole[]);
  if (result.error) return result;
  if (!isPlatformSuperAdmin(result.session!.user)) {
    return { error: fail("Only the platform administrator can perform this action", 403), session: null };
  }
  return result;
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

/**
 * Finer-grained check layered on top of requireRole. Users with custom role
 * assignments are governed by those; users without any fall back to the built-in
 * permission set of their base role — never to "everything".
 */
export async function requirePermission(permissionKey: string) {
  const { session, reason } = await currentSession();
  if (!session?.user?.id) return { error: fail(reason ?? "Authentication required", 401), session: null };
  if (isPlatformSuperAdmin(session.user)) return { error: null, session };
  const assignmentCount = await prisma.userRoleAssignment.count({ where: { userId: session.user.id } });
  if (assignmentCount === 0) {
    return basePermissionAllows(session.user.role, permissionKey) ? { error: null, session } : { error: fail("Insufficient permissions", 403), session: null };
  }
  const grantedCount = await prisma.userRoleAssignment.count({
    where: { userId: session.user.id, role: { permissions: { some: { permission: { key: permissionKey } } } } },
  });
  if (grantedCount === 0) return { error: fail("Insufficient permissions", 403), session: null };
  return { error: null, session };
}

export type EdgeActor = { type: "site"; siteId: string; siteCode: string; organisationId: string };
export type LegacySiteActor = { type: "legacy-site" };
export type UserActor = { type: "user"; id: string; session: Session };
export type Actor = EdgeActor | LegacySiteActor | UserActor;

/** Resolves an edge controller from its per-site key. Inactive sites and suspended companies are refused. */
export async function authenticateEdge(request: Request): Promise<EdgeActor | LegacySiteActor | null> {
  const presented = request.headers.get("x-site-api-key");
  if (!presented) return null;
  if (looksLikeEdgeKey(presented)) {
    const site = await prisma.site.findUnique({
      where: { edgeKeyHash: hashEdgeKey(presented) },
      select: { id: true, code: true, organisationId: true, isActive: true, organisation: { select: { status: true } } },
    });
    if (!site || !site.isActive || site.organisation.status === "SUSPENDED" || site.organisation.status === "ARCHIVED") return null;
    return { type: "site", siteId: site.id, siteCode: site.code, organisationId: site.organisationId };
  }
  return legacySiteKeyMatches(presented) ? { type: "legacy-site" } : null;
}

export async function requireEdge(request: Request) {
  const actor = await authenticateEdge(request);
  if (!actor || actor.type !== "site") return { error: fail("Valid site API key required", 401), actor: null };
  return { error: null, actor };
}

/** Edge controller (by per-site key) or a signed-in user with one of the roles. */
export async function requireSiteOrRole(request: NextRequest | Request, roles: UserRole[]) {
  if (request.headers.get("x-site-api-key")) {
    const edge = await authenticateEdge(request);
    if (!edge) return { error: fail("Invalid site API key", 401), actor: null };
    return { error: null, actor: edge as Actor };
  }
  const result = await requireRole(roles);
  return result.error
    ? { error: result.error, actor: null }
    : { error: null, actor: { type: "user" as const, id: result.session!.user.id, session: result.session! } as Actor };
}

/**
 * Whether an actor may act on a site. Edge keys are bound to exactly one site; the
 * legacy shared key (opt-in only) keeps its old platform-wide reach; users must
 * belong to the site's company and, when site-restricted, be assigned to the site.
 */
export async function actorCanAccessSite(actor: Actor, site: { id: string; organisationId: string }): Promise<boolean> {
  if (actor.type === "site") return actor.siteId === site.id;
  if (actor.type === "legacy-site") return true;
  const { canAccessSite } = await import("@/lib/site-access");
  return canAccessSite(actor.session.user, site);
}

export function requestIp(request: NextRequest | Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}

/**
 * Company-wide administration (users, roles, site access). A Site Admin — an ADMIN
 * restricted to particular sites — is refused, so they cannot widen their own access.
 */
export async function requireCompanyAdmin() {
  const result = await requireRole(["ADMIN"] as UserRole[]);
  if (result.error) return result;
  const { loadAccessContext } = await import("@/lib/site-access");
  const ctx = await loadAccessContext(result.session!.user).catch(() => null);
  if (!ctx || ctx.kind === "sites") return { error: fail("Only company-wide administrators can manage users and access", 403), session: null };
  return result;
}
