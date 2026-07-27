import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { SiteManagement } from "@/components/site-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function Sites({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = mineScope(s.user.organisationId);
  const where = { ...scope, ...(params.q ? { OR: [{ name: { contains: params.q, mode: "insensitive" as const } }, { code: { contains: params.q, mode: "insensitive" as const } }] } : {}) };
  const [sites, total, organisations] = await Promise.all([
    prisma.site.findMany({ where, include: { organisation: true, config: true, hardwareDevices: { include: { calibrationCertificates: { orderBy: { expiresAt: "desc" }, take: 1 } } } }, orderBy: { code: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.site.count({ where }),
    prisma.organisation.findMany({ where: { deletedAt: null, isActive: true, type: "MINING_COMPANY", ...(s.user.organisationId ? { id: s.user.organisationId } : {}) }, orderBy: { name: "asc" } }),
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Sites and compliance</h1><p className="text-xs text-muted-foreground">Manage weighbridge sites, operating thresholds, geofences and legal metrology records.</p></div><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search by name or code…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><SiteManagement initialSites={sites as any} organisations={organisations.map(o=>({id:o.id,name:o.name}))}/>{sites.map(site=><Card key={site.id}><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{site.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{site.code} · {site.address}</p></div><Badge>{site.isActive?"Active":"Inactive"}</Badge></CardHeader><CardContent><div className="grid gap-3 text-sm md:grid-cols-4"><Metric label="Capacity" value={`${site.config?.maxCapacityKg.toLocaleString()} kg`}/><Metric label="Empty max" value={`${site.config?.emptyVehicleMaxKg.toLocaleString()} kg`}/><Metric label="Loaded max" value={`${site.config?.loadedVehicleMaxKg.toLocaleString()} kg`}/><Metric label="Turnaround alert" value={`${site.config?.turnaroundThresholdMinutes} min`}/></div><div className="mt-4 border-t border-border pt-4"><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Hardware and calibration</p>{site.hardwareDevices.map(device=>{const cert=device.calibrationCertificates[0];const days=cert?Math.ceil((cert.expiresAt.getTime()-Date.now())/86400000):null;return <div key={device.id} className="flex items-center justify-between rounded border border-border p-3"><div><p className="text-sm">{device.name}</p><p className="text-xs text-muted-foreground">{device.type} · {device.serialNumber??"No serial"}</p></div><Badge variant={days!==null&&days<=30?"warning":"default"}>{cert?`Calibration ${days} days`:"No certificate"}</Badge></div>})}</div></CardContent></Card>)}<PaginationControls page={page} limit={limit} total={total} basePath="/admin/sites" params={{ q: params.q }} /></div></AppShell>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded border border-border p-3"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono">{value}</p></div>}
