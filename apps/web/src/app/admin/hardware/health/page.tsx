import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatusPill } from "@/components/hardware-center";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { loadAccessContext, siteWhere } from "@/lib/site-access";
import { ageLabel, deriveDeviceStatus, deriveEdgeStatus, type DeviceStatus } from "@/lib/hardware-health";
import { DEVICE_TYPES } from "@/lib/hardware-catalog";
import { TIER_LABEL } from "@/lib/tiers";

export const dynamic = "force-dynamic";

const ORDER: DeviceStatus[] = ["ERROR", "OFFLINE", "WARNING", "UNKNOWN", "MAINTENANCE", "ONLINE", "DISABLED"];

export default async function HardwareHealthPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await loadAccessContext(session.user).catch(() => null);
  if (!ctx) redirect("/");
  const now = new Date();
  const sites = await prisma.site.findMany({
    where: { ...siteWhere(ctx), isActive: true },
    include: {
      organisation: { select: { name: true } },
      hardwareDevices: { include: { lane: { select: { laneNumber: true } } }, orderBy: [{ type: "asc" }, { deviceKey: "asc" }] },
      _count: { select: { incidents: { where: { status: { in: ["OPEN", "ACKNOWLEDGED"] }, type: { in: ["SENSOR_FAULT", "SCALE_FAULT", "ANPR_FAILURE", "CLOUD_SYNC_FAILURE"] } } } } },
    },
    orderBy: [{ organisation: { name: "asc" } }, { code: "asc" }],
  });

  const rows = sites.map((site) => {
    const devices = site.hardwareDevices.map((d) => ({ ...d, status: deriveDeviceStatus(d, now) }));
    const counts = Object.fromEntries(ORDER.map((s) => [s, devices.filter((d) => d.status === s).length])) as Record<DeviceStatus, number>;
    return { site, devices, counts, edge: deriveEdgeStatus(site, now) };
  });
  const totals = ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.reduce((n, r) => n + r.counts[s], 0) }), {} as Record<DeviceStatus, number>);
  const edgesOffline = rows.filter((r) => r.edge === "OFFLINE").length;
  const pending = rows.reduce((n, r) => n + (r.site.edgePendingSync ?? 0), 0);
  const isSuperAdmin = isPlatformSuperAdmin(session.user);

  return (
    <AppShell role={session.user.role} userName={session.user.name ?? "Administrator"} orgName={session.user.organisationName} isSuperAdmin={isSuperAdmin}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Hardware health</h1>
            <p className="text-xs text-muted-foreground">Live device status from edge heartbeats and operator consoles. Devices are shown Offline after three missed heartbeats.</p>
          </div>
          <AutoRefresh seconds={15} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {[
            { l: "Sites monitored", v: rows.length },
            { l: "Devices online", v: totals.ONLINE },
            { l: "Offline / error", v: totals.OFFLINE + totals.ERROR, tone: totals.OFFLINE + totals.ERROR ? "text-danger" : "" },
            { l: "Warnings", v: totals.WARNING, tone: totals.WARNING ? "text-warning" : "" },
            { l: "Edges offline", v: edgesOffline, tone: edgesOffline ? "text-danger" : "" },
            { l: "Pending offline sync", v: pending, tone: pending ? "text-warning" : "" },
          ].map((k) => (
            <Card key={k.l}><CardContent className="p-4"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{k.l}</p><p className={`mt-1 font-mono text-2xl font-semibold ${k.tone ?? ""}`}>{k.v}</p></CardContent></Card>
          ))}
        </div>

        {rows.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No active sites to monitor.</CardContent></Card>}

        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ site, devices, edge }) => (
            <Card key={site.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">{site.name} <span className="font-mono text-xs text-muted-foreground">{site.code}</span></CardTitle>
                    <p className="text-2xs text-muted-foreground">{site.organisation.name} · {TIER_LABEL[site.operatingTier]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {site._count.incidents > 0 && <Badge variant="destructive">{site._count.incidents} hardware incident{site._count.incidents === 1 ? "" : "s"}</Badge>}
                    <Link href={`/admin/hardware?site=${site.code}`} className="text-xs text-primary underline">Configure</Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-2 text-xs sm:grid-cols-4">
                  <span className="text-muted-foreground">Edge</span><span className={edge === "ONLINE" ? "text-success" : edge === "OFFLINE" ? "text-danger" : "text-muted-foreground"}>{edge === "NOT_REQUIRED" ? "Not used" : edge.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="text-muted-foreground">Last heartbeat</span><span>{ageLabel(site.edgeLastSeenAt, now)}</span>
                  <span className="text-muted-foreground">MQTT</span><span>{site.edgeMqttConnected == null ? "—" : site.edgeMqttConnected ? "Connected" : "Disconnected"}</span>
                  <span className="text-muted-foreground">Pending sync</span><span className={site.edgePendingSync ? "text-warning" : ""}>{site.edgePendingSync ?? 0}{site.edgeFailedSync ? ` (${site.edgeFailedSync} failed)` : ""}</span>
                </div>
                {devices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hardware configured for this site.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {devices.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{d.name}</span> <span className="text-muted-foreground">· {DEVICE_TYPES[d.type].label}{d.lane ? ` · lane ${d.lane.laneNumber}` : ""}</span></span>
                        {d.isSimulated && <Badge variant="warning">Simulated</Badge>}
                        <span className="text-2xs text-muted-foreground">{d.lastSeenAt ? ageLabel(d.lastSeenAt, now) : "no report"}</span>
                        <StatusPill status={d.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
