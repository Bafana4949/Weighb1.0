import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default async function RawData({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; page?: string; q?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 50;

  const where = {
    capturedAt: { gte: from, lte: to },
    site: mineScope(s.user.organisationId),
    ...(params.q ? { OR: [{ vehicle: { plate: { contains: params.q, mode: "insensitive" as const } } }, { driver: { firstName: { contains: params.q, mode: "insensitive" as const } } }, { driver: { lastName: { contains: params.q, mode: "insensitive" as const } } }, { commodity: { contains: params.q, mode: "insensitive" as const } }] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({
      where,
      include: { site: true, vehicle: true, driver: true, booking: { include: { transporterOrganisation: true, order: { include: { originSite: true, destinationSite: true } } } } },
      orderBy: { capturedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.weighbridgeTransaction.count({ where }),
  ]);

  const exportQuery = `from=${from.toISOString()}&to=${to.toISOString()}`;

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Raw weighbridge data</h1>
          <p className="text-xs text-muted-foreground">Every captured weighing, {isoDate(from)} to {isoDate(to)}.</p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={isoDate(from)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={isoDate(to)} className="h-9 rounded-sm border border-border bg-surface px-3 text-sm" /></div>
          <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="q">Search</label><Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Plate, driver, product…" /></div>
          <Button type="submit" variant="secondary">Update</Button>
          <a href={`/api/reports/export/csv?${exportQuery}`}><Button type="button" variant="outline"><Download size={14} className="mr-1.5" />Export CSV</Button></a>
        </form>
      </div>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Order number</TableHead><TableHead>Captured</TableHead><TableHead>Site</TableHead><TableHead>Reg number</TableHead><TableHead>Driver</TableHead><TableHead>Product</TableHead><TableHead>Origin</TableHead><TableHead>Destination</TableHead><TableHead>Gross / Tare / Net</TableHead><TableHead>Overload</TableHead></TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((row) => <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.booking.order?.orderNumber ?? row.booking.reference}</TableCell>
              <TableCell className="text-xs">{row.capturedAt.toLocaleString("en-ZA")}</TableCell>
              <TableCell className="text-xs">{row.site.code}</TableCell>
              <TableCell className="font-mono text-xs">{row.vehicle.plate}</TableCell>
              <TableCell className="text-xs">{row.driver.firstName} {row.driver.lastName}</TableCell>
              <TableCell className="text-xs">{row.commodity}</TableCell>
              <TableCell className="text-xs">{row.booking.order?.originSite?.name ?? "—"}</TableCell>
              <TableCell className="text-xs">{row.booking.order?.destinationSite?.name ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{row.grossWeightKg.toLocaleString()} / {row.tareWeightKg.toLocaleString()} / {row.netWeightKg.toLocaleString()} kg</TableCell>
              <TableCell>{row.overload ? <Badge variant="destructive">OVERLOAD</Badge> : <Badge variant="default">OK</Badge>}</TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={10} className="p-8 text-center text-sm text-muted-foreground">No transactions in this date range</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationControls page={page} limit={limit} total={total} basePath="/admin/raw-data" params={{ from: params.from, to: params.to, q: params.q }} />
    </div>
  </AppShell>;
}
