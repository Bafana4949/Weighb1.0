import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default async function Billing({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const transactions = await prisma.weighbridgeTransaction.findMany({
    where: { status: "COMPLETED", capturedAt: { gte: from, lte: to }, site: mineScope(s.user.organisationId) },
    include: { booking: { include: { transporterOrganisation: true } } },
  });

  const byOrg = new Map<string, { name: string; trips: number; netKg: number }>();
  for (const tx of transactions) {
    const org = tx.booking.transporterOrganisation;
    const entry = byOrg.get(org.id) ?? { name: org.name, trips: 0, netKg: 0 };
    entry.trips += 1;
    entry.netKg += tx.netWeightKg;
    byOrg.set(org.id, entry);
  }
  const rows = [...byOrg.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.netKg - a.netKg);
  const totalTrips = rows.reduce((sum, r) => sum + r.trips, 0);
  const totalNetKg = rows.reduce((sum, r) => sum + r.netKg, 0);

  const exportQuery = `from=${from.toISOString()}&to=${to.toISOString()}`;

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing and invoicing export</h1>
          <p className="text-xs text-muted-foreground">Completed tonnage per transporter, for reconciling hauler invoices. {isoDate(from)} to {isoDate(to)}.</p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={isoDate(from)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={isoDate(to)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <Button type="submit" variant="secondary">Update range</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Transporters</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Completed trips</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{totalTrips.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">Total net tonnage</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{(totalNetKg / 1000).toFixed(1)}<span className="ml-1 text-xs font-normal text-muted-foreground">t</span></p></CardContent></Card>
        <Card><CardContent className="flex items-center p-3"><a href={`/api/reports/export/csv?${exportQuery}`}><Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Full CSV export</Button></a></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>By transporter organisation</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Organisation</TableHead><TableHead>Completed trips</TableHead><TableHead>Net tonnage</TableHead><TableHead>Export</TableHead></TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((r) => <TableRow key={r.id}>
              <TableCell>{r.name}</TableCell>
              <TableCell className="font-mono">{r.trips.toLocaleString()}</TableCell>
              <TableCell className="font-mono">{(r.netKg / 1000).toFixed(1)} t</TableCell>
              <TableCell><a href={`/api/reports/export/csv?${exportQuery}&org=${r.id}`}><Button variant="ghost" size="sm"><Download size={13} className="mr-1" />CSV</Button></a></TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No completed transactions in this date range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}
