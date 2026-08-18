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
import { mineScope } from "@/lib/access";
import { PlatformDashboard } from "@/components/platform-dashboard";

async function loadPlatformDashboard() {
  const today = startOfDay(new Date());
  const [clients, totalSites, txToday, unresolvedIncidents, openServiceOrders, hardwareStatuses, syncFailures, activityRaw] = await Promise.all([
    prisma.organisation.findMany({ where: { type: "MINING_COMPANY", deletedAt: null }, select: { id: true, name: true, status: true, sites: { select: { id: true, code: true, name: true } } } }),
    prisma.site.count({ where: { isActive: true } }),
    prisma.weighbridgeTransaction.aggregate({ where: { capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }),
    prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    prisma.serviceOrder.count({ where: { status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] } } }),
    prisma.hardwareStatus.findMany({ orderBy: { lastSeen: "desc" }, distinct: ["siteId"], include: { site: true } }),
    prisma.syncQueue.findMany({ where: { status: "FAILED" }, distinct: ["siteId"], include: { site: true } }),
    prisma.systemLog.findMany({ orderBy: { occurredAt: "desc" }, take: 20, include: { user: { select: safeUserSelect } } }),
  ]);

  const orgBySiteId = new Map<string, string>();
  for (const client of clients) for (const site of client.sites) orgBySiteId.set(site.id, client.id);

  const orgsWithHardwareFailures = new Set(hardwareStatuses.filter((h) => h.health !== "ONLINE").map((h) => orgBySiteId.get(h.siteId)).filter(Boolean));
  const orgsWithSyncFailures = new Set(syncFailures.map((sq) => orgBySiteId.get(sq.siteId)).filter(Boolean));
  const connectedWeighbridges = hardwareStatuses.filter((h) => h.health === "ONLINE").length;
  const disconnectedWeighbridges = hardwareStatuses.length - connectedWeighbridges;

  const clientRows = await Promise.all(clients.map(async (c) => {
    const siteIds = c.sites.map((s) => s.id);
    if (!siteIds.length) return { id: c.id, name: c.name, status: c.status, trucksToday: 0, tonnageTodayKg: 0, openIncidents: 0, sites: [] };
    const [tx, incidents] = await Promise.all([
      prisma.weighbridgeTransaction.aggregate({ where: { siteId: { in: siteIds }, capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }),
      prisma.incident.count({ where: { siteId: { in: siteIds }, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    ]);
    return { id: c.id, name: c.name, status: c.status, trucksToday: tx._count, tonnageTodayKg: tx._sum.netWeightKg ?? 0, openIncidents: incidents, sites: c.sites };
  }));
  clientRows.sort((a, b) => b.tonnageTodayKg - a.tonnageTodayKg);

  const stats = [
    { label: "Total clients", value: clients.length },
    { label: "Active clients", value: clients.filter((c) => c.status === "ACTIVE").length },
    { label: "Suspended clients", value: clients.filter((c) => c.status === "SUSPENDED").length, variant: clients.some((c) => c.status === "SUSPENDED") ? ("warning" as const) : undefined },
    { label: "Operation sites", value: totalSites },
    { label: "Connected weighbridges", value: connectedWeighbridges },
    { label: "Disconnected weighbridges", value: disconnectedWeighbridges, variant: disconnectedWeighbridges > 0 ? ("destructive" as const) : undefined },
    { label: "Transactions today", value: txToday._count },
    { label: "Tonnage today", value: `${((txToday._sum.netWeightKg ?? 0) / 1000).toFixed(1)} t` },
    { label: "Unresolved incidents", value: unresolvedIncidents, variant: unresolvedIncidents > 0 ? ("warning" as const) : undefined },
    { label: "Open service orders", value: openServiceOrders },
    { label: "Clients with hardware failures", value: orgsWithHardwareFailures.size, variant: orgsWithHardwareFailures.size > 0 ? ("destructive" as const) : undefined },
    { label: "Clients with sync failures", value: orgsWithSyncFailures.size, variant: orgsWithSyncFailures.size > 0 ? ("destructive" as const) : undefined },
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

  const since=subDays(new Date(),7);const scope=mineScope(s.user.organisationId);const [sites,tx,openIncidents,hardware]=await Promise.all([prisma.site.findMany({where:{isActive:true,...scope},include:{_count:{select:{transactions:true,incidents:true}}}}),prisma.weighbridgeTransaction.aggregate({where:{capturedAt:{gte:since},site:scope},_count:true,_sum:{netWeightKg:true},_avg:{turnaroundSeconds:true}}),prisma.incident.count({where:{status:{in:["OPEN","ACKNOWLEDGED"]},site:scope}}),prisma.hardwareStatus.findMany({where:{site:scope},orderBy:{lastSeen:"desc"},distinct:["siteId"],include:{site:true}})]);return <AppShell role={s.user.role} userName={s.user.name??"Administrator"} orgName={s.user.organisationName} isSuperAdmin={false}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Enterprise overview</h1><p className="text-xs text-muted-foreground">Cross-site performance, risk and hardware availability.</p></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{l:"Active sites",v:sites.length},{l:"7-day trucks",v:tx._count},{l:"7-day tonnage",v:`${((tx._sum.netWeightKg??0)/1000).toFixed(1)} t`},{l:"Open incidents",v:openIncidents}].map(x=><Card key={x.l}><CardContent className="p-4"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{x.l}</p><p className="mt-1 font-mono text-2xl font-semibold">{x.v}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Site performance</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Location</TableHead><TableHead>Transactions</TableHead><TableHead>Incidents</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{sites.map(site=><TableRow key={site.id}><TableCell><p className="font-medium">{site.name}</p><p className="font-mono text-xs text-muted-foreground">{site.code}</p></TableCell><TableCell>{site.address}</TableCell><TableCell>{site._count.transactions}</TableCell><TableCell>{site._count.incidents}</TableCell><TableCell><Badge>Operational</Badge></TableCell><TableCell className="text-right"><Link href={`/operator?site=${site.code}`} target="_blank" className="text-xs text-primary underline">Open Dashboard</Link></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle>Hardware health</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{hardware.map(item=><div key={item.id} className="rounded-sm border border-border p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{item.site.name}</p><Badge variant={item.health==="ONLINE"?"default":item.health==="DEGRADED"?"warning":"destructive"}>{item.health}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Last seen {item.lastSeen.toLocaleString("en-ZA")}</p></div>)}</CardContent></Card></div></AppShell>;
}
