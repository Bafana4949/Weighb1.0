import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { audit } from "@/lib/audit";
import { userScope } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { siteSchema } from "@/lib/validation";

export const GET = withScopeErrors(async function GET() {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  const isTransporter = a.session!.user.role === "TRANSPORTER";

  const where = isSuperAdmin
    ? { isActive: true }
    : isTransporter
      ? { isActive: true, bookings: { some: { transporterOrganisationId: a.session!.user.organisationId! } } }
      : { isActive: true, ...userScope(a.session!.user) };

  return ok(await prisma.site.findMany({
    where,
    include: { organisation: true, config: true },
    orderBy: { code: "asc" },
  }));
});

export const POST = withScopeErrors(async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  if (!isPlatformSuperAdmin(a.session!.user)) {
    return fail("Forbidden: Only Platform Super Admin can register new sites for clients", 403);
  }

  const parsed = siteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid site", 422);

  const { operatingStart, operatingEnd, ...siteData } = parsed.data;
  try {
    const site = await prisma.site.create({
      data: {
        ...siteData,
        code: siteData.code.toUpperCase(),
        config: {
          create: {
            ...(operatingStart ? { operatingStart } : {}),
            ...(operatingEnd ? { operatingEnd } : {}),
          },
        },
      },
      include: { organisation: true, config: true },
    });
    await audit({
      userId: a.session!.user.id,
      siteId: site.id,
      action: "SITE_CREATED",
      entityType: "site",
      entityId: site.id,
      afterData: site,
    });
    return ok(site, 201);
  } catch (error) {
    return fail("Site code is already registered", 409);
  }
});
