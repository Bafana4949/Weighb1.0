import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { OrderManagement } from "@/components/order-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeUserSelect } from "@/lib/utils";
export default async function Orders({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = { site: mineScope(s.user.organisationId) };
  const where = { ...scope, ...(params.q ? { OR: [{ orderNumber: { contains: params.q, mode: "insensitive" as const } }, { product: { contains: params.q, mode: "insensitive" as const } }, { customerName: { contains: params.q, mode: "insensitive" as const } }, { supplierName: { contains: params.q, mode: "insensitive" as const } }] } : {}) };
  const [orders, total, sites, sources, destinations, products, organisations] = await Promise.all([
    prisma.weighbridgeOrder.findMany({ where, include: { site: true, source: true, destination: true, productRef: true, originSite: true, destinationSite: true, createdBy: { select: safeUserSelect }, bookings: { include: { transactions: true, vehicle: true, driver: true, transporterOrganisation: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.weighbridgeOrder.count({ where }),
    prisma.site.findMany({ where: { isActive: true, ...mineScope(s.user.organisationId) }, orderBy: { name: "asc" } }),
    prisma.source.findMany({ where: { isActive: true, ...mineScope(s.user.organisationId) }, orderBy: { name: "asc" } }),
    prisma.destination.findMany({ where: { isActive: true, ...mineScope(s.user.organisationId) }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { isActive: true, ...mineScope(s.user.organisationId) }, orderBy: { name: "asc" } }),
    prisma.organisation.findMany({ where: { deletedAt: null, isActive: true, type: "HAULIER" }, orderBy: { name: "asc" } })
  ]);
  for (const o of orders) {
    const fKg = o.bookings.reduce((sum, b) => sum + b.transactions.filter(t => t.status === "COMPLETED").reduce((s, t) => s + t.netWeightKg, 0), 0);
    if (fKg >= o.estimatedMassKg && o.status === "ACTIVE") {
      o.status = "FULFILLED";
      prisma.weighbridgeOrder.update({ where: { id: o.id }, data: { status: "FULFILLED" } }).catch(() => null);
    }
  }
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Weighbridge orders</h1><p className="text-xs text-muted-foreground">Create dispatch and receipt orders for transporters to book trucks against.</p></div><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search order no., product, customer…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><OrderManagement initialOrders={JSON.parse(JSON.stringify(orders))} sites={sites.map(s=>({id:s.id,name:s.name}))} sources={JSON.parse(JSON.stringify(sources))} destinations={JSON.parse(JSON.stringify(destinations))} products={JSON.parse(JSON.stringify(products))} organisations={organisations.map(o=>({id:o.id,name:o.name}))} /><PaginationControls page={page} limit={limit} total={total} basePath="/admin/orders" params={{ q: params.q }} /></div></AppShell>;
}
