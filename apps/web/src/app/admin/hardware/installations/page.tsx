import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { InstallationManagement } from "@/components/installation-management";

export default async function HardwareInstallationsPage() {
  const s = await auth();
  if (!s?.user) redirect("/login");
  if (!isPlatformSuperAdmin(s.user)) redirect("/admin");

  const rows = await prisma.weighbridgeInstallation.findMany({
    include: {
      organisation: { select: { name: true } },
      site: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const sites = await prisma.site.findMany({ select: { id: true, name: true, organisationId: true }, orderBy: { name: "asc" } });

  return (
    <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Weighbridge Installations</h1>
          <p className="text-xs text-muted-foreground">Manage physical weighbridge hardware topologies, capacities, and lane configurations.</p>
        </div>
        <InstallationManagement initialInstallations={rows} organisations={orgs} sites={sites} />
      </div>
    </AppShell>
  );
}
