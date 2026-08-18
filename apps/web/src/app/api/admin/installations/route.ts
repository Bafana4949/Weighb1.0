import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const installationSchema = z.object({
  name: z.string().min(2).max(100),
  topology: z.enum(["BIDIRECTIONAL_SINGLE", "DUAL_ENTRY_EXIT"]),
  maxCapacityKg: z.number().int().min(1000).max(150000),
  laneCount: z.number().int().min(1).max(10),
  organisationId: z.string().uuid(),
  siteId: z.string().uuid(),
});

export async function POST(request: Request) {
  const a = await requireRole([UserRole.ADMIN]);
  if (a.error) return a.error;

  const isSuperAdmin = isPlatformSuperAdmin(a.session!.user);
  
  const parsed = installationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid installation data", 422);

  // Tenant isolation check
  if (!isSuperAdmin) {
    if (parsed.data.organisationId !== a.session!.user.organisationId) {
      return fail("You can only create installations for your own organisation", 403);
    }
  }

  // Ensure site belongs to organisation
  const site = await prisma.site.findUnique({ where: { id: parsed.data.siteId } });
  if (!site || site.organisationId !== parsed.data.organisationId) {
    return fail("Invalid site selected for this organisation", 400);
  }

  try {
    const installation = await prisma.weighbridgeInstallation.create({
      data: {
        name: parsed.data.name,
        topology: parsed.data.topology,
        maxCapacityKg: parsed.data.maxCapacityKg,
        laneCount: parsed.data.laneCount,
        organisationId: parsed.data.organisationId,
        siteId: parsed.data.siteId,
      },
      include: {
        organisation: { select: { name: true } },
        site: { select: { name: true } },
      }
    });

    await audit({
      userId: a.session!.user.id,
      action: "INSTALLATION_CREATED",
      entityType: "installation",
      entityId: installation.id,
      afterData: { ...parsed.data },
    });

    return ok(installation, 201);
  } catch (error) {
    console.error("Installation creation error:", error);
    return fail("An error occurred while creating the installation", 500);
  }
}
