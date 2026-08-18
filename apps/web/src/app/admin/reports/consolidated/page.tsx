import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { dateRange } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default async function ConsolidatedReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  if (!isPlatformSuperAdmin(s.user)) redirect("/admin");
  const params = await searchParams;
  const urlParams = new URLSearchParams(params as Record<string, string>);
  const range = dateRange(urlParams);

  const companies = await prisma.organisation.findMany({ where: { type: "MINING_COMPANY", deletedAt: null }, select: { id: true, name: true, status: true, sites: { select: { id: true } } } });
  const rows = await Promise.all(companies.map(async (c) => {
    const siteIds = c.sites.map((site) => site.id);
    if (!siteIds.length) return { id: c.id, name: c.name, status: c.status, sites: 0, trucks: 0, totalTonnageKg: 0, unresolvedIncidents: 0 };
    const [tx, incidents] = await Promise.all([
      prisma.weighbridgeTransaction.aggregate({ where: { siteId: { in: siteIds }, capturedAt: range }, _count: true, _sum: { netWeightKg: true } }),
      prisma.incident.count({ where: { siteId: { in: siteIds }, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    ]);
    return { id: c.id, name: c.name, status: c.status, sites: siteIds.length, trucks: tx._count, totalTonnageKg: tx._sum.netWeightKg ?? 0, unresolvedIncidents: incidents };
  }));
  rows.sort((a, b) => b.totalTonnageKg - a.totalTonnageKg);

  const totals = rows.reduce((acc, r) => ({ trucks: acc.trucks + r.trucks, tonnageKg: acc.tonnageKg + r.totalTonnageKg, incidents: acc.incidents + r.unresolvedIncidents }), { trucks: 0, tonnageKg: 0, incidents: 0 });

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={true}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-foreground">Platform report — all clients</h1><p className="text-xs text-muted-foreground">{isoDate(range.gte)} to {isoDate(range.lte)}. Consolidated across every client organisation.</p></div>
        <form className="flex items-end gap-2" method="get">
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={isoDate(range.gte)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={isoDate(range.lte)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <Button type="submit" variant="secondary">Update</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Clients</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Trucks (all clients)</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{totals.trucks.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Total tonnage</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{(totals.tonnageKg / 1000).toFixed(1)}<span className="ml-1 text-xs font-normal text-muted-foreground">t</span></p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Unresolved incidents</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{totals.incidents}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Client comparison</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead>Sites</TableHead><TableHead>Trucks</TableHead><TableHead>Tonnage</TableHead><TableHead>Open incidents</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((r) => <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell><Badge variant={r.status === "ACTIVE" ? "default" : r.status === "SUSPENDED" ? "destructive" : "muted"}>{r.status.replace("_", " ")}</Badge></TableCell>
              <TableCell>{r.sites}</TableCell>
              <TableCell className="font-mono">{r.trucks.toLocaleString()}</TableCell>
              <TableCell className="font-mono">{(r.totalTonnageKg / 1000).toFixed(1)} t</TableCell>
              <TableCell>{r.unresolvedIncidents > 0 ? <Badge variant="warning">{r.unresolvedIncidents}</Badge> : "0"}</TableCell>
              <TableCell><a href={`/admin/reports?from=${isoDate(range.gte)}&to=${isoDate(range.lte)}`} className="text-xs text-primary underline">View</a></TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No client organisations registered yet</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}
