import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { roleAllowed } from "@/lib/access";

export function ok<T>(data: T, status = 200, meta?: { page: number; total: number; limit: number }) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

export { roleAllowed } from "@/lib/access";

export async function requireRole(roles: UserRole[]) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return { error: fail("Authentication required", 401), session: null };
  if (!roleAllowed(session.user.role, roles)) return { error: fail("Insufficient permissions", 403), session: null };
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
