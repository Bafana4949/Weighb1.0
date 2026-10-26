import { redirect } from "next/navigation";
import { startOfDay } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { LiveOperatorDashboard } from "@/components/live-operator-dashboard";
import { activeWindowWhere } from "@/lib/booking-service";
import { siteIdentifierWhere } from "@/lib/utils";
import { loadAccessContext, siteWhere } from "@/lib/site-access";
import { TenantScopeError } from "@/lib/access";

export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const session = await auth(); if (!session?.user) redirect("/login");
  const params = await searchParams;
  // Operators restricted to particular sites only ever see those sites.
  const ctx = await loadAccessContext(session.user).catch((e) => { if (e instanceof TenantScopeError) return null; throw e; });
  const scope = ctx ? siteWhere(ctx) : { id: "00000000-0000-0000-0000-000000000000" };
  const preferred = params.site ?? process.env.SITE_DAEMON_SITE_CODE ?? null;
  const site =
    (preferred ? await prisma.site.findFirst({ where: { ...siteIdentifierWhere(preferred), isActive: true, ...scope } }) : null) ??
    (params.site ? null : await prisma.site.findFirst({ where: { isActive: true, ...scope }, orderBy: { code: "asc" } }));
  if (!site) return (
    <AppShell role={session.user.role} userName={session.user.name ?? "Operator"} isSuperAdmin={isPlatformSuperAdmin(session.user)}>
      <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
        <p>{params.site ? "That site is not available to you." : "No active site is assigned to you. Ask your administrator for site access."}</p>
      </div>
    </AppShell>
  );
  const today = startOfDay(new Date());
  const products = await prisma.product.findMany({ where: { organisationId: site.organisationId, isActive: true }, select: { name: true }, orderBy: { name: "asc" } });
  const [queue, aggregate, turnaround, allSites] = await Promise.all([
    prisma.booking.findMany({
      where: {
        siteId: site.id,
        status: { in: ["APPROVED", "ACTIVE"] },
        transactions: {
          none: {
            status: "IN_PROGRESS",
          },
        },
        OR: [
          {
            orderId: { not: null },
            order: { status: "ACTIVE" },
          },
          {
            orderId: null,
            transactions: {
              none: { status: "COMPLETED" },
            },
          },
        ],
        ...activeWindowWhere(),
      },
      include: {
        vehicle: true,
        driver: { select: { firstName: true, lastName: true } },
        trailer: true,
        transporterOrganisation: true,
        order: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, status: "COMPLETED", capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, status: "COMPLETED", capturedAt: { gte: today }, turnaroundSeconds: { not: null } }, _avg: { turnaroundSeconds: true } }),
    prisma.site.findMany({ where: { isActive: true, ...scope }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);
  return (
    <AppShell role={session.user.role} userName={session.user.name ?? session.user.email ?? "Operator"} isSuperAdmin={isPlatformSuperAdmin(session.user)}>
      <LiveOperatorDashboard
        siteCode={site.code}
        productOptions={products.map((p) => p.name)}
        availableSites={allSites}
        initialQueue={queue.map((item) => ({
          id: item.id,
          reference: item.reference,
          plate: item.vehicle.plate,
          driver: `${item.driver.firstName} ${item.driver.lastName}`,
          trailer: item.trailer?.trailerId ?? "",
          transporter: item.transporterOrganisation.name,
          commodity: item.commodity,
          orderId: item.orderId,
          orderNumber: item.order?.orderNumber ?? null,
          customerName: item.order?.customerName ?? null,
          stockpile: item.order?.stockpile ?? null,
          status: item.status,
          presetTareWeightKg: (item.order as any)?.presetTareWeightKg ?? null,
          presetGrossWeightKg: (item.order as any)?.presetGrossWeightKg ?? null,
          useConstantTare: (item.order as any)?.useConstantTare ?? false,
          useConstantGross: (item.order as any)?.useConstantGross ?? false,
        }))}
        stats={{
          trucks: aggregate._count,
          tonnage: aggregate._sum.netWeightKg ?? 0,
          turnaround: turnaround._avg.turnaroundSeconds ?? 0,
          pending: queue.length,
        }}
      />
    </AppShell>
  );
}
