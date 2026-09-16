import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userSiteScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { IncidentManagement } from "@/components/incident-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";

const INCIDENT_TYPES = ["UNAUTHORISED_ACCESS","OVERLOAD","FRAUD_ALERT","SENSOR_FAULT","DRIVER_MISMATCH","ANPR_FAILURE","CLOUD_SYNC_FAILURE","SCALE_FAULT","ROUTE_DEVIATION","CLONE_DETECTION","TARE_DRIFT","CALIBRATION_EXPIRY","POWER_RECOVERY","MANUAL_OVERRIDE","UNDERWEIGHT_EMPTY"];
const SEVERITIES = ["LOW","MEDIUM","HIGH","CRITICAL"];
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

export default async function AdminIncidents({ searchParams }: { searchParams: Promise<{ page?: string; type?: string; severity?: string; resolved?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const where = {
    ...userSiteScope(s.user),
    ...(params.type ? { type: params.type as never } : {}),
    ...(params.severity ? { severity: params.severity as never } : {}),
    ...(params.resolved === "true" ? { status: "RESOLVED" as const } : params.resolved === "false" ? { status: { not: "RESOLVED" as const } } : {}),
  };
  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({ where, include: { site: true, vehicle: true, driver: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.incident.count({ where }),
  ]);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold text-foreground">Incidents</h1><p className="text-xs text-muted-foreground">Overload, fraud, hardware and access incidents across your sites.</p></div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="type">Type</label><select id="type" name="type" defaultValue={params.type ?? ""} className={selectClass()}><option value="">All types</option>{INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
        <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="severity">Severity</label><select id="severity" name="severity" defaultValue={params.severity ?? ""} className={selectClass()}><option value="">All severities</option>{SEVERITIES.map((sv) => <option key={sv} value={sv}>{sv}</option>)}</select></div>
        <div><label className="mb-1 block text-2xs uppercase tracking-wider text-muted-foreground" htmlFor="resolved">Status</label><select id="resolved" name="resolved" defaultValue={params.resolved ?? ""} className={selectClass()}><option value="">All statuses</option><option value="false">Unresolved</option><option value="true">Resolved</option></select></div>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <IncidentManagement initialIncidents={JSON.parse(JSON.stringify(incidents))} />
      <PaginationControls page={page} limit={limit} total={total} basePath="/admin/incidents" params={{ type: params.type, severity: params.severity, resolved: params.resolved }} />
    </div>
  </AppShell>;
}
