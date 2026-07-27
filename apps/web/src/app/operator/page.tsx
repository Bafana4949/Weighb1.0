import { redirect } from "next/navigation";
import { startOfDay } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { LiveOperatorDashboard } from "@/components/live-operator-dashboard";
import { activeWindowWhere } from "@/lib/booking-service";

export default async function OperatorPage() {
  const session = await auth(); if (!session?.user) redirect("/login");
  const site = await prisma.site.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });
  if (!site) return <p>No active site configured.</p>;
  const today = startOfDay(new Date());
  const [queue, aggregate, turnaround] = await Promise.all([
    prisma.booking.findMany({ where: { siteId: site.id, ...activeWindowWhere() }, include: { vehicle: true, driver: true }, orderBy: { windowStart: "asc" }, take: 20 }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, capturedAt: { gte: today } }, _count: true, _sum: { netWeightKg: true } }),
    prisma.weighbridgeTransaction.aggregate({ where: { siteId: site.id, capturedAt: { gte: today }, turnaroundSeconds: { not: null } }, _avg: { turnaroundSeconds: true } }),
  ]);
  return <AppShell role={session.user.role} userName={session.user.name ?? session.user.email ?? "Operator"}><LiveOperatorDashboard siteCode={site.code} initialQueue={queue.map((item)=>({id:item.id,reference:item.reference,plate:item.vehicle.plate,driver:`${item.driver.firstName} ${item.driver.lastName}`,commodity:item.commodity,status:item.status}))} stats={{trucks:aggregate._count,tonnage:aggregate._sum.netWeightKg??0,turnaround:turnaround._avg.turnaroundSeconds??0,pending:queue.length}}/></AppShell>;
}
