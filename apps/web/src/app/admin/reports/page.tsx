import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { userScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { dateRange, incidentsReport, tonnageByGroup, turnaroundBySite } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatKg } from "@/lib/utils";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; group?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const urlParams = new URLSearchParams(params as Record<string, string>);
  const range = dateRange(urlParams);
  const group = params.group ?? "commodity";
  const scope = userScope(s.user);
  const exportQuery = `from=${isoDate(range.gte)}&to=${isoDate(range.lte)}&group=${group}`;

  const [{ rows: tonnageRows, rawCount: trucks, totalTonnageKg }, { sites: turnaroundBySiteRows, bottlenecks }, incidents] = await Promise.all([
    tonnageByGroup(range, group, scope),
    turnaroundBySite(range, scope),
    incidentsReport(range, scope),
  ]);
  const avgLoadKg = trucks ? totalTonnageKg / trucks : 0;

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-foreground">Reports</h1><p className="text-xs text-muted-foreground">{isoDate(range.gte)} to {isoDate(range.lte)}.</p></div>
        <form className="flex items-end gap-2" method="get">
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={isoDate(range.gte)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={isoDate(range.lte)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="group">Group tonnage by</label><select id="group" name="group" defaultValue={group} className={selectClass()}><option value="commodity">Product</option><option value="vehicle">Vehicle</option><option value="site">Site</option></select></div>
          <Button type="submit" variant="secondary">Update</Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/reports/export/csv?${exportQuery}`} download={`transactions-${isoDate(range.gte)}-to-${isoDate(range.lte)}.csv`}>
            Download transactions CSV
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/reports/export/pdf?${exportQuery}`} target="_blank" rel="noopener noreferrer">
            View PDF report
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/reports/export/pdf?${exportQuery}&download=true`} download={`report-${isoDate(range.gte)}-to-${isoDate(range.lte)}.pdf`}>
            Download PDF report
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/reports/incidents/export/csv?${exportQuery}`} download={`incidents-${isoDate(range.gte)}-to-${isoDate(range.lte)}.csv`}>
            Download incidents CSV
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Trucks in range</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{trucks.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Total tonnage</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{(totalTonnageKg / 1000).toFixed(1)}<span className="ml-1 text-xs font-normal text-muted-foreground">t</span></p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Average load</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{formatKg(avgLoadKg)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Unresolved incidents</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{incidents.unresolved}</p></CardContent></Card>
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
            <TableBody>{turnaroundBySiteRows.length ? turnaroundBySiteRows.map((r) => <TableRow key={r.site}><TableCell className="font-mono">{r.site}</TableCell><TableCell>{Math.round(r.average_seconds / 60)} min</TableCell><TableCell>{Math.round(r.maximum_seconds / 60)} min</TableCell><TableCell>{r.transactions}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No turnaround data in this range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Slowest turnarounds</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Waybill</TableHead><TableHead>Site</TableHead><TableHead>Turnaround</TableHead></TableRow></TableHeader>
            <TableBody>{bottlenecks.length ? bottlenecks.map((r) => <TableRow key={r.transaction_id}><TableCell className="font-mono text-xs">{r.waybill_number}</TableCell><TableCell className="font-mono">{r.site}</TableCell><TableCell>{Math.round((r.turnaround_seconds ?? 0) / 60)} min</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="p-8 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Incidents, exceptions and compliance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {incidents.by_type.slice(0, 8).map((t) => <div key={t.type} className="rounded-sm border border-border p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{t.type.replace(/_/g, " ")}</p><p className="mt-1 font-mono text-lg font-semibold">{t.count}</p></div>)}
            {!incidents.by_type.length && <p className="col-span-full p-4 text-center text-sm text-muted-foreground">No incidents in this range</p>}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Total: <span className="font-mono text-foreground">{incidents.total}</span></span>
            <span>Unresolved: <span className="font-mono text-foreground">{incidents.unresolved}</span></span>
            <span>Average resolution time: <span className="font-mono text-foreground">{incidents.average_resolution_minutes ?? "—"} min</span></span>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Site</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>{incidents.rows.slice(0, 15).map((r) => <TableRow key={r.id}>
              <TableCell className="text-xs">{r.type.replace(/_/g, " ")}</TableCell>
              <TableCell><Badge variant={r.severity === "CRITICAL" || r.severity === "HIGH" ? "destructive" : r.severity === "MEDIUM" ? "warning" : "muted"}>{r.severity}</Badge></TableCell>
              <TableCell><Badge variant={r.status === "RESOLVED" || r.status === "DISMISSED" ? "default" : "warning"}>{r.status}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{r.site}</TableCell>
              <TableCell className="text-xs">{r.created_at.toLocaleDateString("en-ZA")}</TableCell>
            </TableRow>)}{!incidents.rows.length && <TableRow><TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No incidents in this range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}
