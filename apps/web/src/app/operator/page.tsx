import { redirect } from "next/navigation";
import { startOfDay } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { LiveOperatorDashboard } from "@/components/live-operator-dashboard";
import { activeWindowWhere } from "@/lib/booking-service";
import { siteIdentifierWhere } from "@/lib/utils";

// The web app talks to exactly one site-daemon (SITE_DAEMON_URL) — there is
// no per-site daemon routing yet. Once more than one Site row exists (e.g.
// this seed's second, DUAL_ENTRY_EXIT site), picking "the first active site
// alphabetically" can silently pick a DIFFERENT site than the one the
// daemon is actually wired to, showing that site's booking queue/stats next
// to another site's live telemetry and hardware controls. Ask the daemon
// which site it actually serves instead of guessing.
async function resolveDaemonSite(organisationId: string | null) {
  const scope = organisationId ? { organisationId } : {};
  const daemonUrl = process.env.SITE_DAEMON_URL;
  const isLocalhost = !daemonUrl || daemonUrl.includes("localhost") || daemonUrl.includes("127.0.0.1");
  const isCloud = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE);

  // In cloud deployments without an explicit remote daemon URL, do not stall on localhost
  if (isCloud && isLocalhost) {
    return prisma.site.findFirst({ where: { isActive: true, ...scope }, orderBy: { code: "asc" } });
  }

  try {
    const response = await fetch(`${daemonUrl ?? "http://localhost:8000"}/health`, { cache: "no-store", signal: AbortSignal.timeout(600) });
    if (!response.ok) throw new Error(`daemon returned ${response.status}`);
    const body = await response.json();
    if (typeof body.site_id === "string") {
      const site = await prisma.site.findFirst({ where: { ...siteIdentifierWhere(body.site_id), isActive: true, ...scope } });
      if (site) return site;
    }
  } catch {
    // Daemon unreachable — fall through to the best-effort fallback below
  }
  return prisma.site.findFirst({ where: { isActive: true, ...scope }, orderBy: { code: "asc" } });
}

export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const session = await auth(); if (!session?.user) redirect("/login");
  const params = await searchParams;
  const scope = session.user.organisationId ? { organisationId: session.user.organisationId } : {};
  const site = params.site ? await prisma.site.findFirst({ where: { ...siteIdentifierWhere(params.site), isActive: true, ...scope } }) : await resolveDaemonSite(session.user.organisationId);
  if (!site) return (
    <AppShell role={session.user.role} userName={session.user.name ?? "Operator"} isSuperAdmin={isPlatformSuperAdmin(session.user)}>
      <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
        <p>No active site configured. Your session may be stale, or you have no sites assigned.</p>
      </div>
    </AppShell>
  );
  const today = startOfDay(new Date());
  const [queue, aggregate, turnaround, allSites] = await Promise.all([
    prisma.booking.findMany({ where: { siteId: site.id, ...activeWindowWhere() }, include: { vehicle: true, driver: true, trailer: true, transporterOrganisation: true }, orderBy: { windowStart: "asc" }, take: 100 }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, capturedAt: { gte: today }, turnaroundSeconds: { not: null } }, _avg: { turnaroundSeconds: true } }),
    prisma.site.findMany({ where: { isActive: true, ...scope }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);
  return <AppShell role={session.user.role} userName={session.user.name ?? session.user.email ?? "Operator"} isSuperAdmin={isPlatformSuperAdmin(session.user)}><LiveOperatorDashboard siteCode={site.code} availableSites={allSites} initialQueue={queue.map((item)=>({id:item.id,reference:item.reference,plate:item.vehicle.plate,driver:`${item.driver.firstName} ${item.driver.lastName}`,trailer:item.trailer?.trailerId??"",transporter:item.transporterOrganisation.name,commodity:item.commodity,status:item.status}))} stats={{trucks:aggregate._count,tonnage:aggregate._sum.netWeightKg??0,turnaround:turnaround._avg.turnaroundSeconds??0,pending:queue.length}}/></AppShell>;
}
