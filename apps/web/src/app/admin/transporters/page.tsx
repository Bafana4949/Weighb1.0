import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { TransporterManagement } from "@/components/transporter-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const include = { users: { orderBy: { createdAt: "asc" as const } }, _count: { select: { vehicles: true, drivers: true } } };
export default async function Transporters({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const searchClause = params.q ? { name: { contains: params.q, mode: "insensitive" as const } } : {};
  const scope = s.user.organisationId ? { clientMiningCompanies: { some: { miningCompanyId: s.user.organisationId } } } : {};

  const [applications, others, othersTotal] = await Promise.all([
    prisma.organisation.findMany({ where: { type: "HAULIER", deletedAt: null, isActive: false, users: { some: { status: "INVITED" } }, ...searchClause, ...scope }, include, orderBy: { name: "asc" } }),
    prisma.organisation.findMany({ where: { type: "HAULIER", deletedAt: null, NOT: { isActive: false, users: { some: { status: "INVITED" } } }, ...searchClause, ...scope }, include, orderBy: { name: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.organisation.count({ where: { type: "HAULIER", deletedAt: null, NOT: { isActive: false, users: { some: { status: "INVITED" } } }, ...searchClause, ...scope } }),
  ]);
  const transporters = [...applications, ...others].map(({ users, ...org }) => ({ ...org, users: users.map(({ passwordHash, ...u }) => u) }));
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Transporters</h1><p className="text-xs text-muted-foreground">Register haulier companies before they can book trucks and use the weighbridge. Each one gets its own login and dashboard.</p></div><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search by company name…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><TransporterManagement initialTransporters={JSON.parse(JSON.stringify(transporters))}/><PaginationControls page={page} limit={limit} total={othersTotal} basePath="/admin/transporters" params={{ q: params.q }} /></div></AppShell>;
}
