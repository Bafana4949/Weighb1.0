import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function audit(input: {
  userId?: string | null;
  siteId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  return prisma.systemLog.create({ data: {
    userId: input.userId ?? null,
    siteId: input.siteId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    beforeData: input.beforeData as Prisma.InputJsonValue | undefined,
    afterData: input.afterData as Prisma.InputJsonValue | undefined,
  } });
}
