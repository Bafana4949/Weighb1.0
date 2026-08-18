import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ page?: string; entityType?: string; action?: string; from?: string; to?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  if (s.user.organisationId) redirect("/admin");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 40;
  const where = {
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.action ? { action: { contains: params.action, mode: "insensitive" as const } } : {}),
    ...((params.from || params.to) ? { occurredAt: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.systemLog.findMany({ where, include: { user: true, site: true }, orderBy: { occurredAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.systemLog.count({ where }),
  ]);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold text-foreground">Audit log</h1><p className="text-xs text-muted-foreground">Every create, update, approve and reject action across the whole platform.</p></div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div><Label htmlFor="entityType">Entity type</Label><Input id="entityType" name="entityType" defaultValue={params.entityType ?? ""} placeholder="site, booking, organisation…" /></div>
        <div><Label htmlFor="action">Action contains</Label><Input id="action" name="action" defaultValue={params.action ?? ""} placeholder="APPROVED…" /></div>
        <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={params.from ?? ""} /></div>
        <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={params.to ?? ""} /></div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Site</TableHead></TableRow></TableHeader>
            <TableBody>{rows.length ? rows.map((r) => <TableRow key={r.id}>
              <TableCell className="text-2xs">{r.occurredAt.toLocaleString("en-ZA")}</TableCell>
              <TableCell className="text-xs">{r.user ? `${r.user.firstName} ${r.user.lastName}` : "System"}{r.user && <p className="text-2xs text-muted-foreground">{r.user.email}</p>}</TableCell>
              <TableCell className="font-mono text-xs">{r.action}</TableCell>
              <TableCell className="text-xs">{r.entityType}{r.entityId ? <span className="text-2xs text-muted-foreground"> · {r.entityId.slice(0, 8)}</span> : ""}</TableCell>
              <TableCell className="text-xs">{r.site?.name ?? "—"}</TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No audit entries match these filters</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationControls page={page} limit={limit} total={total} basePath="/admin/audit-log" params={{ entityType: params.entityType, action: params.action, from: params.from, to: params.to }} />
    </div>
  </AppShell>;
}
