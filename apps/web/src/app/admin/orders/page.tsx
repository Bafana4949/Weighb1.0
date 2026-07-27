import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { OrderManagement } from "@/components/order-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function Orders({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = { site: mineScope(s.user.organisationId) };
  const where = { ...scope, ...(params.q ? { OR: [{ orderNumber: { contains: params.q, mode: "insensitive" as const } }, { product: { contains: params.q, mode: "insensitive" as const } }, { customerName: { contains: params.q, mode: "insensitive" as const } }, { supplierName: { contains: params.q, mode: "insensitive" as const } }] } : {}) };
  const [orders, total, sites] = await Promise.all([
    prisma.weighbridgeOrder.findMany({ where, include: { site: true, originSite: true, destinationSite: true, createdBy: true, bookings: { include: { transactions: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.weighbridgeOrder.count({ where }),
    prisma.site.findMany({ where: { isActive: true, ...mineScope(s.user.organisationId) }, orderBy: { name: "asc" } }),
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Weighbridge orders</h1><p className="text-xs text-muted-foreground">Create dispatch and receipt orders for transporters to book trucks against.</p></div><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search order no., product, customer…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><OrderManagement initialOrders={orders as any} sites={sites.map(s=>({id:s.id,name:s.name}))}/><PaginationControls page={page} limit={limit} total={total} basePath="/admin/orders" params={{ q: params.q }} /></div></AppShell>;
}
