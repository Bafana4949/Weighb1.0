import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { HardwareCenter } from "@/components/hardware-center";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { loadAccessContext, siteWhere } from "@/lib/site-access";
import { ageLabel, deriveEdgeStatus } from "@/lib/hardware-health";

export default async function HardwareConfigurationPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await loadAccessContext(session.user).catch(() => null);
  if (!ctx) redirect("/");
  const params = await searchParams;
  const sites = await prisma.site.findMany({
    where: siteWhere(ctx),
    include: { organisation: { select: { id: true, name: true, licensedTier: true } }, lanes: { orderBy: { laneNumber: "asc" }, select: { id: true, laneNumber: true, name: true } } },
    orderBy: [{ organisation: { name: "asc" } }, { code: "asc" }],
  });
  const companies = [...new Map(sites.map((s) => [s.organisation.id, s.organisation])).values()];
  const now = new Date();
  const isSuperAdmin = isPlatformSuperAdmin(session.user);

  return (
    <AppShell role={session.user.role} userName={session.user.name ?? "Administrator"} orgName={session.user.organisationName} isSuperAdmin={isSuperAdmin}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Hardware &amp; site configuration</h1>
          <p className="text-xs text-muted-foreground">Choose a company, site and lane, set the operating tier, and configure exactly the hardware installed there.</p>
        </div>
        <HardwareCenter
          isSuperAdmin={isSuperAdmin}
          initialSiteId={sites.find((s) => s.id === params.site || s.code === params.site)?.id}
          companies={companies}
          sites={sites.map((s) => ({
            id: s.id, code: s.code, name: s.name, organisationId: s.organisationId, isActive: s.isActive, lanes: s.lanes,
            edgeKeyPrefix: s.edgeKeyPrefix, edgeLastSeenAt: s.edgeLastSeenAt?.toISOString() ?? null, edgeVersion: s.edgeVersion,
            edgePendingSync: s.edgePendingSync, edgeFailedSync: s.edgeFailedSync, edgeMqttConnected: s.edgeMqttConnected, edgeSimulated: s.edgeSimulated,
            edgeStatus: deriveEdgeStatus(s, now), edgeAge: ageLabel(s.edgeLastSeenAt, now),
          }))}
        />
      </div>
    </AppShell>
  );
}
