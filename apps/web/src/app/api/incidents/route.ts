import { IncidentType, Severity, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, requireSiteOrRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { parsePagination, siteIdentifierWhere } from "@/lib/utils";
import { routeNotification } from "@/lib/notifications";

const schema = z.object({
  type: z.nativeEnum(IncidentType),
  severity: z.nativeEnum(Severity),
  title: z.string().min(3),
  description: z.string().min(5),
  site_id: z.string().optional(),
  siteId: z.string().uuid().optional(),
  booking_id: z.string().optional().nullable(),
  vehicle_id: z.string().optional().nullable(),
  driver_id: z.string().optional().nullable(),
  evidence_urls: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const { page, limit, skip } = parsePagination(url);
  const type = url.searchParams.get("type") as IncidentType | null;
  const severity = url.searchParams.get("severity") as Severity | null;
  const resolved = url.searchParams.get("resolved");

  const where = {
    ...(type ? { type } : {}),
    ...(severity ? { severity } : {}),
    ...(resolved === "true" ? { status: "RESOLVED" as const } : resolved === "false" ? { status: { not: "RESOLVED" as const } } : {}),
    site: userScope(a.session!.user),
  };

  const [rows, total] = await Promise.all([
    prisma.incident.findMany({ where, include: { site: true, vehicle: true, driver: true }, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.incident.count({ where }),
  ]);
  return ok(rows, 200, { page, total, limit });
});

export const POST = withScopeErrors(async function POST(request: NextRequest) {
  const a = await requireSiteOrRole(request, [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues.map((x) => x.message).join("; "), 422);
  const site = parsed.data.siteId
    ? await prisma.site.findUnique({ where: { id: parsed.data.siteId } })
    : await prisma.site.findFirst({ where: siteIdentifierWhere(parsed.data.site_id ?? "") });
  if (!site) return fail("Site not found", 404);
  const row = await prisma.incident.create({
    data: {
      siteId: site.id,
      bookingId: parsed.data.booking_id,
      vehicleId: parsed.data.vehicle_id,
      driverId: parsed.data.driver_id,
      type: parsed.data.type,
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description,
      evidenceUrls: parsed.data.evidence_urls ?? [],
      anomalyScore: parsed.data.severity === "CRITICAL" ? 50 : parsed.data.severity === "HIGH" ? 25 : parsed.data.severity === "MEDIUM" ? 10 : 0,
    },
  });
  await routeNotification({
    event: parsed.data.type,
    severity: parsed.data.severity,
    subject: parsed.data.title,
    body: parsed.data.description,
    metadata: { incident_id: row.id, site_id: site.code, ...parsed.data.metadata },
  });
  return ok(row, 201);
});
