import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { SiteWizard } from "@/components/site-wizard";
import { isPlatformSuperAdmin } from "@/lib/permissions";

export default async function NewSitePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isPlatformSuperAdmin(session.user)) redirect("/admin/sites");
  const companies = await prisma.organisation.findMany({
    where: { type: "MINING_COMPANY", deletedAt: null, status: { in: ["ACTIVE", "PENDING_SETUP"] } },
    select: { id: true, name: true, licensedTier: true, _count: { select: { products: true, users: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <AppShell role={session.user.role} userName={session.user.name ?? "Administrator"} isSuperAdmin>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Site setup wizard</h1>
          <p className="text-xs text-muted-foreground">Create a site, choose its tier and hardware, then validate and activate it.</p>
        </div>
        <SiteWizard companies={companies.map((c) => ({ id: c.id, name: c.name, licensedTier: c.licensedTier, products: c._count.products, users: c._count.users }))} />
      </div>
    </AppShell>
  );
}
