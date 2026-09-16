import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roleAllowed, TenantScopeError } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";

export function ok<T>(data: T, status = 200, meta?: { page: number; total: number; limit: number }) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

export { roleAllowed, withScopeErrors } from "@/lib/access";

export async function requireRole(roles: UserRole[]) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return { error: fail("Authentication required", 401), session: null };
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

/**
 * Additive, finer-grained check layered alongside (not replacing) requireRole.
 * Resolves via UserRoleAssignment -> Role -> RolePermission -> Permission.
 * A platform super-admin is never restricted by client-level role permissions.
 */
export async function requirePermission(permissionKey: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: fail("Authentication required", 401), session: null };
  if (isPlatformSuperAdmin(session.user)) return { error: null, session };
  const assignmentCount = await prisma.userRoleAssignment.count({ where: { userId: session.user.id } });
  if (assignmentCount === 0) return { error: null, session };
  const grantedCount = await prisma.userRoleAssignment.count({
    where: { userId: session.user.id, role: { permissions: { some: { permission: { key: permissionKey } } } } },
  });
  if (grantedCount === 0) return { error: fail("Insufficient permissions", 403), session: null };
  return { error: null, session };
}

export async function requireSiteOrRole(request: NextRequest, roles: UserRole[]) {
  const configured = process.env.SITE_DAEMON_API_KEY;
  const key = request.headers.get("x-site-api-key");
  if (configured && key && key === configured) return { error: null, actor: { type: "site" as const, id: "edge-daemon" } };
  const result = await requireRole(roles);
  return result.error ? { error: result.error, actor: null } : { error: null, actor: { type: "user" as const, id: result.session!.user.id } };
}

export function requestIp(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}
