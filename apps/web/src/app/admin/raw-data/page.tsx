import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userSiteScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText } from "lucide-react";
import { formatSADate, formatSATime } from "@/lib/datetime";

const isoDate = formatSADate;
const isoTime = formatSATime;
function formatTurnaroundTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default async function RawData({ searchParams }: { searchParams: Promise<{ [key: string]: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 50;

  const transactionNo = params.transactionNo;
  const orderNo = params.orderNo;
  const supplier = params.supplier;
  const customer = params.customer;
  const type = params.type;
  const material = params.material;
  const source = params.source;
  const destination = params.destination;
  const transporter = params.transporter;
  const driver = params.driver;
  const overload = params.overload;
  const status = params.status;
  const mineTicketNo = params.mineTicketNo;
  const truckNo = params.truckNo;

  const where: any = {
    capturedAt: { gte: from, lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) },
    ...userSiteScope(s.user),
    ...(transactionNo ? { OR: [{ edgeTransactionId: transactionNo }, { waybillNumber: transactionNo }] } : {}),
    ...(orderNo ? { booking: { order: { orderNumber: orderNo } } } : {}),
    ...(supplier ? { booking: { order: { supplierName: supplier } } } : {}),
    ...(customer ? { booking: { order: { customerName: customer } } } : {}),
    ...(type ? { transactionType: type } : {}),
    ...(material ? { commodity: material } : {}),
    ...(source ? { OR: [{ booking: { order: { source: { name: source } } } }, { booking: { order: { originSite: { name: source } } } }] } : {}),
    ...(destination ? { OR: [{ booking: { order: { destination: { name: destination } } } }, { booking: { order: { destinationSite: { name: destination } } } }] } : {}),
    ...(transporter ? { booking: { transporterOrganisation: { name: transporter } } } : {}),
    ...(driver ? { driver: { OR: [{ firstName: driver }, { lastName: driver }] } } : {}),
    ...(truckNo ? { vehicle: { plate: truckNo } } : {}),
    ...(overload === "true" ? { overload: true } : overload === "false" ? { overload: false } : {}),
    ...(status ? { status } : {}),
    ...(mineTicketNo ? { mineTicketNumber: mineTicketNo } : {})
  };

  const [rows, total, statsResult] = await Promise.all([
    prisma.weighbridgeTransaction.findMany({
      where,
      include: { 
        site: true, 
        vehicle: true, 
        driver: true, 
        booking: { 
          include: { 
            transporterOrganisation: true, 
            order: { include: { originSite: true, destinationSite: true, source: true, destination: true } } 
          } 
        } 
      },
      orderBy: { capturedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.weighbridgeTransaction.count({ where }),
    prisma.weighbridgeTransaction.aggregate({
      where,
      _sum: { netWeightKg: true, grossWeightKg: true, tareWeightKg: true, turnaroundSeconds: true },
      _avg: { netWeightKg: true }
    })
  ]);

  const urlParams = new URLSearchParams(params);
  const exportQuery = urlParams.toString();
  
  const totalNet = statsResult._sum.netWeightKg ?? 0;
  const totalGross = statsResult._sum.grossWeightKg ?? 0;
  const totalTare = statsResult._sum.tareWeightKg ?? 0;
  const avgNet = statsResult._avg.netWeightKg ?? 0;
  const avgTime = (statsResult._sum.turnaroundSeconds ?? 0) / (total || 1);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Weighbridge Transaction Report</h1>
          <p className="text-xs text-muted-foreground">Every captured weighing, {isoDate(from)} to {isoDate(to)}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/reports/export/csv?${exportQuery}`} download={`weighbridge-transactions-${isoDate(from)}-to-${isoDate(to)}.csv`}>
              <Download size={14} className="mr-1.5" />CSV Export
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/reports/export/transactions/pdf?${exportQuery}`} target="_blank" rel="noopener noreferrer">
              <FileText size={14} className="mr-1.5" />View PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/reports/export/transactions/pdf?${exportQuery}&download=true`} download={`transactions-${isoDate(from)}-to-${isoDate(to)}.pdf`}>
              <Download size={14} className="mr-1.5" />Download PDF
            </a>
          </Button>
        </div>
      </div>

      <details className="group rounded-md border border-border bg-surface p-4 print:hidden">
        <summary className="cursor-pointer font-medium text-sm">Advanced Filters</summary>
        <form className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" method="get">
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">From</label><input name="from" type="date" defaultValue={isoDate(from)} className="h-8 w-full rounded-sm border px-2 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">To</label><input name="to" type="date" defaultValue={isoDate(to)} className="h-8 w-full rounded-sm border px-2 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Tran No</label><Input name="transactionNo" defaultValue={transactionNo} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Order No</label><Input name="orderNo" defaultValue={orderNo} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Source</label><Input name="source" defaultValue={source} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Destination</label><Input name="destination" defaultValue={destination} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Supplier</label><Input name="supplier" defaultValue={supplier} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Customer</label><Input name="customer" defaultValue={customer} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Material</label><Input name="material" defaultValue={material} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Transporter</label><Input name="transporter" defaultValue={transporter} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Truck No</label><Input name="truckNo" defaultValue={truckNo} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Driver</label><Input name="driver" defaultValue={driver} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Mine Ticket No</label><Input name="mineTicketNo" defaultValue={mineTicketNo} className="h-8 text-xs" /></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Type</label><select name="type" defaultValue={type} className="h-8 w-full rounded-sm border px-2 text-xs bg-background"><option value="">All</option><option value="INBOUND">INBOUND</option><option value="OUTBOUND">OUTBOUND</option><option value="DELIVERY">DELIVERY</option><option value="COLLECTION">COLLECTION</option><option value="FIRST_WEIGH">FIRST_WEIGH</option><option value="SECOND_WEIGH">SECOND_WEIGH</option><option value="GROSS_ONLY">GROSS_ONLY</option><option value="TARE_ONLY">TARE_ONLY</option></select></div>
          <div><label className="mb-1 block text-2xs uppercase text-muted-foreground">Overload</label><select name="overload" defaultValue={overload} className="h-8 w-full rounded-sm border px-2 text-xs bg-background"><option value="">All</option><option value="true">Yes</option><option value="false">No</option></select></div>
          <div className="col-span-full flex gap-2">
            <Button type="submit" size="sm">Apply Filters</Button>
            <a href="/admin/raw-data"><Button type="button" variant="ghost" size="sm">Reset Filters</Button></a>
          </div>
        </form>
      </details>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Transactions</p><p className="mt-1 font-mono text-lg font-semibold">{total.toLocaleString()}</p></CardContent></Card>
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Total Nett</p><p className="mt-1 font-mono text-lg font-semibold">{(totalNet/1000).toFixed(2)} t</p></CardContent></Card>
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Total Gross</p><p className="mt-1 font-mono text-lg font-semibold">{(totalGross/1000).toFixed(2)} t</p></CardContent></Card>
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Total Tare</p><p className="mt-1 font-mono text-lg font-semibold">{(totalTare/1000).toFixed(2)} t</p></CardContent></Card>
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Average Nett</p><p className="mt-1 font-mono text-lg font-semibold">{(avgNet/1000).toFixed(2)} t</p></CardContent></Card>
        <Card className="print:shadow-none print:border-none"><CardContent className="p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">Average Time</p><p className="mt-1 font-mono text-lg font-semibold">{formatTurnaroundTime(Math.round(avgTime))}</p></CardContent></Card>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardContent className="p-0 overflow-x-auto relative max-w-full print:overflow-visible">
          <Table className="min-w-[1800px] text-xs">
            <TableHeader className="bg-muted/50 sticky top-0">
              <TableRow>
                <TableHead className="whitespace-nowrap">Transaction No</TableHead>
                <TableHead className="whitespace-nowrap">Tran Date</TableHead>
                <TableHead className="whitespace-nowrap">Tran Time</TableHead>
                <TableHead className="whitespace-nowrap">Order No</TableHead>
                <TableHead className="whitespace-nowrap">Supplier</TableHead>
                <TableHead className="whitespace-nowrap">Customer</TableHead>
                <TableHead className="whitespace-nowrap">Tran Type</TableHead>
                <TableHead className="whitespace-nowrap">Material</TableHead>
                <TableHead className="whitespace-nowrap">Destination</TableHead>
                <TableHead className="whitespace-nowrap">Source</TableHead>
                <TableHead className="whitespace-nowrap">Truck No</TableHead>
                <TableHead className="whitespace-nowrap">Gross Date</TableHead>
                <TableHead className="whitespace-nowrap">Gross Time</TableHead>
                <TableHead className="whitespace-nowrap">Tare Date</TableHead>
                <TableHead className="whitespace-nowrap">Tare Time</TableHead>
                <TableHead className="whitespace-nowrap text-right">Nett Weight</TableHead>
                <TableHead className="whitespace-nowrap text-right">Gross Weight</TableHead>
                <TableHead className="whitespace-nowrap text-right">Tare Weight</TableHead>
                <TableHead className="whitespace-nowrap">Total Tran Time</TableHead>
                <TableHead className="whitespace-nowrap">Transporter</TableHead>
                <TableHead className="whitespace-nowrap">Mine Ticket No</TableHead>
                <TableHead className="whitespace-nowrap text-right">Mine Ticket Mass</TableHead>
                <TableHead className="whitespace-nowrap">Driver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.waybillNumber || row.edgeTransactionId}</TableCell>
                  <TableCell>{isoDate(row.capturedAt)}</TableCell>
                  <TableCell>{isoTime(row.capturedAt)}</TableCell>
                  <TableCell className="font-mono">{row.booking.order?.orderNumber ?? row.booking.reference ?? "—"}</TableCell>
                  <TableCell>{row.booking.order?.supplierName ?? "—"}</TableCell>
                  <TableCell>{row.booking.order?.customerName ?? "—"}</TableCell>
                  <TableCell>{row.transactionType ?? "—"}</TableCell>
                  <TableCell>{row.commodity}</TableCell>
                  <TableCell>{row.booking.order?.destination?.name ?? row.booking.order?.destinationSite?.name ?? "—"}</TableCell>
                  <TableCell>{row.booking.order?.source?.name ?? row.booking.order?.originSite?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono">{row.vehicle.plate}</TableCell>
                  <TableCell>{isoDate(row.grossCapturedAt ?? row.entryAt)}</TableCell>
                  <TableCell>{isoTime(row.grossCapturedAt ?? row.entryAt)}</TableCell>
                  <TableCell>{isoDate(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt)}</TableCell>
                  <TableCell>{isoTime(row.tareCapturedAt ?? row.exitAt ?? row.capturedAt)}</TableCell>
                  <TableCell className="font-mono text-right">{row.netWeightKg.toLocaleString()} kg</TableCell>
                  <TableCell className="font-mono text-right">{row.grossWeightKg.toLocaleString()} kg</TableCell>
                  <TableCell className="font-mono text-right">{row.tareWeightKg.toLocaleString()} kg</TableCell>
                  <TableCell className="font-mono">{formatTurnaroundTime(row.turnaroundSeconds)}</TableCell>
                  <TableCell>{row.booking.transporterOrganisation?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono">{row.mineTicketNumber ?? "—"}</TableCell>
                  <TableCell className="font-mono text-right">{row.mineTicketMass ? `${row.mineTicketMass.toLocaleString()} kg` : "—"}</TableCell>
                  <TableCell>{row.driver.firstName} {row.driver.lastName}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={23} className="p-8 text-center text-sm text-muted-foreground">No transactions found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <div className="print:hidden">
        <PaginationControls page={page} limit={limit} total={total} basePath="/admin/raw-data" params={params as Record<string, string>} />
      </div>
    </div>
  </AppShell>;
}
