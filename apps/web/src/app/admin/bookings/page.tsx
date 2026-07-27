import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { BookingApprovals } from "@/components/booking-approvals";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = { site: mineScope(s.user.organisationId) };
  const searchClause = params.q ? { OR: [{ reference: { contains: params.q, mode: "insensitive" as const } }, { vehicle: { plate: { contains: params.q, mode: "insensitive" as const } } }, { driver: { firstName: { contains: params.q, mode: "insensitive" as const } } }, { driver: { lastName: { contains: params.q, mode: "insensitive" as const } } }] } : {};
  const activeWhere = { ...scope, ...searchClause, status: { notIn: ["COMPLETED", "EXPIRED", "CANCELLED"] as const } };
  const [pending, others, othersTotal] = await Promise.all([
    prisma.booking.findMany({ where: { ...scope, ...searchClause, status: "PENDING" }, include: { vehicle: true, driver: true, site: true, transporterOrganisation: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.booking.findMany({ where: { ...activeWhere, status: { not: "PENDING" } }, include: { vehicle: true, driver: true, site: true, transporterOrganisation: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.booking.count({ where: { ...activeWhere, status: { not: "PENDING" } } }),
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Truck booking approvals</h1><p className="text-xs text-muted-foreground">A transporter's request to use the weighbridge with a specific truck and driver. Approve before the vehicle can be authorised at the gate.</p></div><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search order reference, plate, driver…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><BookingApprovals initialBookings={[...pending, ...others] as any}/><PaginationControls page={page} limit={limit} total={othersTotal} basePath="/admin/bookings" params={{ q: params.q }} /></div></AppShell>;
}
