import { redirect } from "next/navigation";
import { startOfDay, endOfDay } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatKg } from "@/lib/utils";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const group = params.group ?? "commodity";
  const scope = mineScope(s.user.organisationId);

  const [rangeRows, todayIncidents, turnaroundRows] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({ where: { capturedAt: { gte: from, lte: to }, site: scope }, include: { vehicle: true, site: true } }),
    prisma.incident.groupBy({ by: ["severity"], where: { createdAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) }, site: scope }, _count: true }),
    prisma.weighbridgeTransaction.findMany({ where: { capturedAt: { gte: from, lte: to }, turnaroundSeconds: { not: null }, site: scope }, include: { site: true }, orderBy: { turnaroundSeconds: "desc" } }),
  ]);

  const totalTonnageKg = rangeRows.reduce((sum, r) => sum + r.netWeightKg, 0);
  const avgLoadKg = rangeRows.length ? totalTonnageKg / rangeRows.length : 0;

  const tonnageByGroup = new Map<string, { group: string; net_weight_kg: number; transactions: number }>();
  for (const row of rangeRows) {
    const key = group === "vehicle" ? row.vehicle.plate : group === "site" ? row.site.code : row.commodity;
    const current = tonnageByGroup.get(key) ?? { group: key, net_weight_kg: 0, transactions: 0 };
    current.net_weight_kg += row.netWeightKg; current.transactions++;
    tonnageByGroup.set(key, current);
  }
  const tonnageRows = [...tonnageByGroup.values()].sort((a, b) => b.net_weight_kg - a.net_weight_kg);

  const bySite = new Map<string, number[]>();
  for (const row of turnaroundRows) { const values = bySite.get(row.site.code) ?? []; values.push(row.turnaroundSeconds!); bySite.set(row.site.code, values); }
  const turnaroundBySite = [...bySite].map(([site, values]) => ({ site, average_seconds: Math.round(values.reduce((a, b) => a + b, 0) / values.length), maximum_seconds: Math.max(...values), transactions: values.length }));
  const bottlenecks = turnaroundRows.slice(0, 10);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-foreground">Reports</h1><p className="text-xs text-muted-foreground">{isoDate(from)} to {isoDate(to)}.</p></div>
        <form className="flex items-end gap-2" method="get">
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={isoDate(from)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={isoDate(to)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="group">Group tonnage by</label><select id="group" name="group" defaultValue={group} className={selectClass()}><option value="commodity">Product</option><option value="vehicle">Vehicle</option><option value="site">Site</option></select></div>
          <Button type="submit" variant="secondary">Update</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Trucks in range</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{rangeRows.length.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Total tonnage</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{(totalTonnageKg / 1000).toFixed(1)}<span className="ml-1 text-xs font-normal text-muted-foreground">t</span></p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Average load</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{formatKg(avgLoadKg)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Incidents today</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{todayIncidents.reduce((sum, i) => sum + i._count, 0)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Tonnage by {group}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="capitalize">{group}</TableHead><TableHead>Net tonnage</TableHead><TableHead>Trucks</TableHead></TableRow></TableHeader>
            <TableBody>{tonnageRows.length ? tonnageRows.map((r) => <TableRow key={r.group}><TableCell className="font-mono">{r.group}</TableCell><TableCell className="font-mono">{(r.net_weight_kg / 1000).toFixed(1)} t</TableCell><TableCell>{r.transactions}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="p-8 text-center text-sm text-muted-foreground">No transactions in this range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Turnaround by site</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Average</TableHead><TableHead>Maximum</TableHead><TableHead>Trucks</TableHead></TableRow></TableHeader>
            <TableBody>{turnaroundBySite.length ? turnaroundBySite.map((r) => <TableRow key={r.site}><TableCell className="font-mono">{r.site}</TableCell><TableCell>{Math.round(r.average_seconds / 60)} min</TableCell><TableCell>{Math.round(r.maximum_seconds / 60)} min</TableCell><TableCell>{r.transactions}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No turnaround data in this range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Slowest turnarounds</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Order number</TableHead><TableHead>Site</TableHead><TableHead>Turnaround</TableHead></TableRow></TableHeader>
            <TableBody>{bottlenecks.length ? bottlenecks.map((r) => <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.waybillNumber}</TableCell><TableCell className="font-mono">{r.site.code}</TableCell><TableCell>{Math.round((r.turnaroundSeconds ?? 0) / 60)} min</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="p-8 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}
