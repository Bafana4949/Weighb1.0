import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function audit(input: {
  userId?: string | null;
  siteId?: string | null;
  /** Owning company. Derived from the site when omitted so company admins can see the entry. */
  organisationId?: string | null;
  /** Role the actor held when acting (e.g. PLATFORM_SUPER_ADMIN, ADMIN, OPERATOR, EDGE). */
  actorRole?: string | null;
  /** Justification for overrides, cancellations, manual weights, gate overrides. */
  reason?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  let organisationId = input.organisationId ?? null;
  if (!organisationId && input.siteId) {
    organisationId = (await prisma.site.findUnique({ where: { id: input.siteId }, select: { organisationId: true } }))?.organisationId ?? null;
  }
  return prisma.systemLog.create({ data: {
    userId: input.userId ?? null,
    siteId: input.siteId ?? null,
    organisationId,
    actorRole: input.actorRole ?? null,
    reason: input.reason ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    beforeData: input.beforeData as Prisma.InputJsonValue | undefined,
    afterData: input.afterData as Prisma.InputJsonValue | undefined,
  } });
}

/** Actor fields for audit() from a session user. */
export function auditActor(user: { id: string; role?: string | null; platformRole?: string | null; organisationId?: string | null }) {
  return { userId: user.id, actorRole: user.platformRole ?? user.role ?? null };
}
