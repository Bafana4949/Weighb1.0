import { redirect } from "next/navigation";
import { startOfDay, subDays } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatKg, safeUserSelect } from "@/lib/utils";
import { userScope } from "@/lib/access";
import { PlatformDashboard } from "@/components/platform-dashboard";
import { deriveDeviceStatus, deriveEdgeStatus } from "@/lib/hardware-health";
import { TIER_LABEL } from "@/lib/tiers";
import { loadAccessContext, siteWhere } from "@/lib/site-access";

async function safeQuery<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function loadPlatformDashboard() {
  const today = startOfDay(new Date());
  const [clients, totalSites, txToday, unresolvedIncidents, openServiceOrders, hardwareStatuses, syncFailures, activityRaw] = await Promise.all([
    safeQuery(prisma.organisation.findMany({ where: { type: "MINING_COMPANY", deletedAt: null }, select: { id: true, name: true, status: true, sites: { select: { id: true, code: true, name: true } } } }), []),
    safeQuery(prisma.site.count({ where: { isActive: true } }), 0),
    safeQuery(prisma.weighbridgeTransaction.aggregate({ where: { capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }), { _count: 0, _sum: { netWeightKg: null } }),
    safeQuery(prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }), 0),
    safeQuery(prisma.serviceOrder.count({ where: { status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] } } }), 0),
    safeQuery(prisma.hardwareStatus.findMany({ orderBy: { lastSeen: "desc" }, distinct: ["siteId"], include: { site: true } }), []),
    safeQuery(prisma.syncQueue.findMany({ where: { status: "FAILED" }, distinct: ["siteId"], include: { site: true } }), []),
    safeQuery(prisma.systemLog.findMany({ orderBy: { occurredAt: "desc" }, take: 20, include: { user: { select: safeUserSelect } } }), []),
  ]);

  const clientRows = await Promise.all(clients.map(async (c) => {
    const siteIds = c.sites.map((s) => s.id);
    if (!siteIds.length) return { id: c.id, name: c.name, status: c.status, trucksToday: 0, tonnageTodayKg: 0, openIncidents: 0, sites: [] };
    const [tx, incidents] = await Promise.all([
      safeQuery(prisma.weighbridgeTransaction.aggregate({ where: { siteId: { in: siteIds }, capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }), { _count: 0, _sum: { netWeightKg: null } }),
      safeQuery(prisma.incident.count({ where: { siteId: { in: siteIds }, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }), 0),
    ]);
    return { id: c.id, name: c.name, status: c.status, trucksToday: tx._count, tonnageTodayKg: tx._sum.netWeightKg ?? 0, openIncidents: incidents, sites: c.sites };
  }));
  clientRows.sort((a, b) => b.tonnageTodayKg - a.tonnageTodayKg);

  // Real platform health: tiers, edge connectivity, hardware faults and sync failures.
  const now = new Date();
  const [tierGroups, edgeSites, devices, activeUsers] = await Promise.all([
    safeQuery(prisma.site.groupBy({ by: ["operatingTier"], where: { isActive: true }, _count: true }), [] as { operatingTier: string; _count: number }[]),
    safeQuery(prisma.site.findMany({ where: { isActive: true, edgeKeyHash: { not: null } }, select: { edgeKeyHash: true, edgeLastSeenAt: true, edgeFailedSync: true } }), []),
    safeQuery(prisma.hardwareDevice.findMany({ where: { isActive: true, site: { isActive: true } }, select: { isActive: true, maintenanceMode: true, lastHealth: true, lastSeenAt: true, configuration: true } }), []),
    safeQuery(prisma.user.count({ where: { status: "ACTIVE", lastLoginAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } } }), 0),
  ]);
  const tierCount = (t: string) => tierGroups.find((g) => g.operatingTier === t)?._count ?? 0;
  const edgesOffline = edgeSites.filter((x) => deriveEdgeStatus(x, now) !== "ONLINE").length;
  const deviceAlerts = devices.filter((d) => ["OFFLINE", "ERROR"].includes(deriveDeviceStatus(d, now)) && d.lastSeenAt).length;
  const failedSync = edgeSites.reduce((n, x) => n + (x.edgeFailedSync ?? 0), 0) + syncFailures.length;

  const stats = [
    { label: "Total clients", value: clients.length },
    { label: "Active clients", value: clients.filter((c) => c.status === "ACTIVE").length },
    { label: "Suspended clients", value: clients.filter((c) => c.status === "SUSPENDED").length, variant: clients.some((c) => c.status === "SUSPENDED") ? ("warning" as const) : undefined },
    { label: "Operation sites", value: totalSites },
    { label: "Tiers (M / S / F)", value: `${tierCount("MANUAL")} / ${tierCount("SEMI_AUTOMATIC")} / ${tierCount("FULLY_AUTOMATIC")}` },
    { label: "Edge controllers offline", value: `${edgesOffline} of ${edgeSites.length}`, variant: edgesOffline ? ("warning" as const) : undefined },
    { label: "Hardware alerts", value: deviceAlerts, variant: deviceAlerts ? ("warning" as const) : undefined },
    { label: "Failed syncs", value: failedSync, variant: failedSync ? ("warning" as const) : undefined },
    { label: "Active users (7 days)", value: activeUsers },
    { label: "Transactions today", value: txToday._count },
    { label: "Tonnage today", value: `${((txToday._sum.netWeightKg ?? 0) / 1000).toFixed(1)} t` },
  ];

  const activity = activityRaw.map((log) => ({ id: log.id, action: log.action, entityType: log.entityType, occurredAt: log.occurredAt, userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null }));

  return { stats, clients: clientRows, activity };
}

export default async function AdminPage(){
  const s=await auth();
  if(!s?.user)redirect("/login");
  const isSuperAdmin = isPlatformSuperAdmin(s.user);

  if (isSuperAdmin) {
    const { stats, clients, activity } = await loadPlatformDashboard();
    return <AppShell role={s.user.role} userName={s.user.name??"Administrator"} orgName={s.user.organisationName} isSuperAdmin={true}>
      <PlatformDashboard stats={stats} clients={clients} activity={activity} />
    </AppShell>;
  }

  const since=subDays(new Date(),7);
  const scope=siteWhere(await loadAccessContext(s.user));
  const [sites,tx,openIncidents,hardware]=await Promise.all([
    safeQuery(prisma.site.findMany({where:{isActive:true,...scope},include:{_count:{select:{transactions:true,incidents:true}}}}), []),
    safeQuery(prisma.weighbridgeTransaction.aggregate({where:{capturedAt:{gte:since},site:scope},_count:true,_sum:{netWeightKg:true},_avg:{turnaroundSeconds:true}}), { _count: 0, _sum: { netWeightKg: null }, _avg: { turnaroundSeconds: null } }),
    safeQuery(prisma.incident.count({where:{status:{in:["OPEN","ACKNOWLEDGED"]},site:scope}}), 0),
    safeQuery(prisma.hardwareStatus.findMany({where:{site:scope},orderBy:{lastSeen:"desc"},distinct:["siteId"],include:{site:true}}), []),
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Administrator"} orgName={s.user.organisationName} isSuperAdmin={false}>
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold text-foreground">Enterprise overview</h1><p className="text-xs text-muted-foreground">Sites, tiers, throughput and exceptions across your company.</p></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{l:"Active sites",v:sites.length},{l:"7-day trucks",v:tx._count},{l:"7-day tonnage",v:`${((tx._sum.netWeightKg??0)/1000).toFixed(1)} t`},{l:"Open incidents",v:openIncidents}].map(x=><Card key={x.l}><CardContent className="p-4"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{x.l}</p><p className="mt-1 font-mono text-2xl font-semibold">{x.v}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Site performance</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Location</TableHead><TableHead>Transactions</TableHead><TableHead>Incidents</TableHead><TableHead>Tier / edge</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{sites.map(site=><TableRow key={site.id}><TableCell><p className="font-medium">{site.name}</p><p className="font-mono text-xs text-muted-foreground">{site.code}</p></TableCell><TableCell>{site.address}</TableCell><TableCell>{site._count.transactions}</TableCell><TableCell>{site._count.incidents}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Badge variant="info">{TIER_LABEL[site.operatingTier]}</Badge>{site.edgeKeyHash ? (deriveEdgeStatus(site) === "ONLINE" ? <Badge>Edge online</Badge> : <Badge variant="warning">Edge offline</Badge>) : null}</div></TableCell><TableCell className="text-right"><Link href={`/operator?site=${site.code}`} target="_blank" className="text-xs text-primary underline">Open Console</Link></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  </AppShell>;
}
