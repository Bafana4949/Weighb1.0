import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { fail, ok, requireSiteOrRole } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { siteIdentifierWhere } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const access = await requireSiteOrRole(request, [UserRole.ADMIN, UserRole.OPERATOR]);
  if (access.error) return access.error;
  const site = request.nextUrl.searchParams.get("site");
  if (!site) return fail("site is required", 422);
  const resolved = await prisma.site.findFirst({ where: siteIdentifierWhere(site) });
  if (!resolved) return fail("Site not found", 404);
  const head = await prisma.weighbridgeTransaction.findFirst({
    where: { siteId: resolved.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { integrityHash: true, capturedAt: true },
  });
  return ok({ integrity_hash: head?.integrityHash ?? "0".repeat(64), captured_at: head?.capturedAt ?? null });
}
