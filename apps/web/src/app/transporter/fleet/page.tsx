import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { FleetManagement } from "@/components/fleet-management";
const LIMIT = 50;
export default async function TransporterFleet({ searchParams }: { searchParams: Promise<{ vpage?: string; dpage?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const org = s.user.organisationId;
  const params = await searchParams;
  const vpage = Math.max(1, Number(params.vpage ?? 1));
  const dpage = Math.max(1, Number(params.dpage ?? 1));
  const [vehicles, vehicleTotal, drivers, driverTotal, trailers] = await Promise.all([
    prisma.vehicle.findMany({ where: { organisationId: org??undefined, deletedAt: null }, orderBy: { plateNormalized: "asc" }, skip: (vpage - 1) * LIMIT, take: LIMIT }),
    prisma.vehicle.count({ where: { organisationId: org??undefined, deletedAt: null } }),
    prisma.driver.findMany({ where: { organisationId: org??undefined, deletedAt: null }, orderBy: { lastName: "asc" }, skip: (dpage - 1) * LIMIT, take: LIMIT }),
    prisma.driver.count({ where: { organisationId: org??undefined, deletedAt: null } }),
    prisma.trailer.findMany({ where: { vehicle: { organisationId: org??undefined } }, include: { vehicle: true }, orderBy: { trailerId: "asc" }, take: 200 }),
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Transporter"} orgName={s.user.organisationName}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Fleet</h1><p className="text-xs text-muted-foreground">Vehicles and drivers registered to your organisation.</p></div><FleetManagement initialVehicles={vehicles.map(v=>({...v,organisation:null}))} initialDrivers={drivers.map(({idNumberEncrypted,idNumberHash,...d})=>({...d,organisation:null}))} initialTrailers={trailers} organisations={[]} isAdmin={false} vehiclePagination={{ page: vpage, limit: LIMIT, total: vehicleTotal }} driverPagination={{ page: dpage, limit: LIMIT, total: driverTotal }}/></div></AppShell>;
}
