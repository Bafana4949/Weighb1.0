import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { ServiceOrderManagement } from "@/components/service-order-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { safeUserSelect } from "@/lib/utils";

const STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED", "CANCELLED"];
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

export default async function AdminServiceOrders({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const isSuperAdmin = isPlatformSuperAdmin(s.user);
  const where = { ...(isSuperAdmin ? {} : mineScope(s.user.organisationId)), ...(params.status ? { status: params.status as never } : {}) };

  const [orders, total, organisations] = await Promise.all([
    prisma.serviceOrder.findMany({ where, include: { organisation: true, site: true, createdBy: { select: safeUserSelect }, assignedTo: { select: safeUserSelect } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.serviceOrder.count({ where }),
    isSuperAdmin ? prisma.organisation.findMany({ where: { type: "MINING_COMPANY", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isSuperAdmin}>
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold text-foreground">Service orders</h1><p className="text-xs text-muted-foreground">Operational, technical and hardware support tickets{isSuperAdmin ? " across every client" : " for your organisation"}.</p></div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="status">Status</label><select id="status" name="status" defaultValue={params.status ?? ""} className={selectClass()}><option value="">All statuses</option>{STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}</select></div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <ServiceOrderManagement initialOrders={JSON.parse(JSON.stringify(orders))} organisations={organisations} isSuperAdmin={isSuperAdmin} />
      <PaginationControls page={page} limit={limit} total={total} basePath="/admin/service-orders" params={{ status: params.status }} />
    </div>
  </AppShell>;
}
