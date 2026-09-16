import { redirect } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { SiteManagement } from "@/components/site-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function Sites({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const isSuper = isPlatformSuperAdmin(s.user);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = userScope(s.user);
  const where = {
    ...scope,
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { code: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [sites, total, organisations] = await Promise.all([
    prisma.site.findMany({
      where,
      include: {
        organisation: true,
        config: true,
        lanes: { orderBy: { laneNumber: "asc" } },
        hardwareDevices: {
          include: {
            calibrationCertificates: { orderBy: { expiresAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { code: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.site.count({ where }),
    prisma.organisation.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        type: "MINING_COMPANY",
        ...(s.user.organisationId ? { id: s.user.organisationId } : {}),
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AppShell
      role={s.user.role}
      userName={s.user.name ?? "Admin"}
      orgName={s.user.organisationName}
      isSuperAdmin={isSuper}
    >
      <div className="space-y-5">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sites & Compliance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage weighbridge sites, legal metrology thresholds, operating hours and hardware calibration.
            </p>
          </div>
          {isSuper ? (
            <Badge className="bg-primary/10 text-primary border border-primary/20 font-semibold px-3 py-1 text-xs">
              👑 Platform Super Admin Mode
            </Badge>
          ) : (
            <Badge variant="muted" className="bg-surface text-muted-foreground border-border font-medium px-3 py-1 text-xs">
              🏢 Mine Client Organization Scope
            </Badge>
          )}
        </div>

        {/* Client Admin Notice Banner */}
        {!isSuper && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-foreground flex items-start gap-3.5">
            <Building2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-700 dark:text-blue-400">
                Client Site Access Managed by Platform Super Admin
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your assigned mining sites, operating thresholds, and scale deck devices are listed below. In accordance with system governance, new weighbridge sites can only be registered and provisioned by the **Platform Super Admin**.
              </p>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <form className="flex items-center gap-2" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search sites by name or code…"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {params.q && (
            <Button variant="ghost" size="sm" asChild>
              <a href="/admin/sites">Clear</a>
            </Button>
          )}
        </form>

        {/* Site Management Table */}
        <SiteManagement
          initialSites={JSON.parse(JSON.stringify(sites))}
          organisations={organisations.map((o) => ({ id: o.id, name: o.name }))}
          isSuperAdmin={isSuper}
        />

        {/* Detailed Site Cards */}
        <div className="space-y-4">
          {sites.map((site) => (
            <Card key={site.id} className="overflow-hidden border border-border">
              <CardHeader className="flex-row items-center justify-between bg-surface/50 border-b border-border py-3.5">
                <div>
                  <CardTitle className="text-base font-bold">{site.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Code: <span className="font-mono font-semibold text-foreground">{site.code}</span> · {site.address}
                    {site.organisation && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold text-primary">
                        {site.organisation.name}
                      </span>
                    )}
                  </p>
                </div>
                <Badge variant={site.isActive ? "default" : "destructive"}>
                  {site.isActive ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid gap-3 text-sm grid-cols-2 md:grid-cols-4">
                  <Metric label="Max Scale Capacity" value={`${site.config?.maxCapacityKg?.toLocaleString() ?? "—"} kg`} />
                  <Metric label="Empty Vehicle Max" value={`${site.config?.emptyVehicleMaxKg?.toLocaleString() ?? "—"} kg`} />
                  <Metric label="Loaded Vehicle Max" value={`${site.config?.loadedVehicleMaxKg?.toLocaleString() ?? "—"} kg`} />
                  <Metric label="Turnaround Alert" value={`${site.config?.turnaroundThresholdMinutes ?? "—"} min`} />
                </div>

                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Connected Scale Hardware & Legal Metrology
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {site.hardwareDevices.length ? (
                      site.hardwareDevices.map((device) => {
                        const cert = device.calibrationCertificates[0];
                        const days = cert
                          ? Math.ceil((cert.expiresAt.getTime() - Date.now()) / 86400000)
                          : null;
                        return (
                          <div
                            key={device.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                          >
                            <div>
                              <p className="text-sm font-semibold">{device.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {device.type} · Serial: {device.serialNumber ?? "Integrated Loadcell"}
                              </p>
                            </div>
                            <Badge variant={days !== null && days <= 30 ? "warning" : "default"}>
                              {cert ? `Valid (${days} days)` : "No Certificate"}
                            </Badge>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">
                        Dual load cells calibrated with digital UART transmitter.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <PaginationControls
          page={page}
          limit={limit}
          total={total}
          basePath="/admin/sites"
          params={{ q: params.q }}
        />
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="mt-1 font-mono font-bold text-foreground">{value}</p>
    </div>
  );
}
