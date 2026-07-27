import { IncidentType, Severity } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function runFraudChecks(transactionId: string): Promise<void> {
  const current = await prisma.weighbridgeTransaction.findUnique({
    where: { id: transactionId },
    include: { vehicle: true, driver: true, site: true },
  });
  if (!current) return;
  const incidents: Array<{ type: IncidentType; severity: Severity; title: string; description: string; score: number }> = [];

  if (Math.abs(current.tareWeightKg - current.vehicle.tareWeightKg) > 500) {
    incidents.push({ type: IncidentType.TARE_DRIFT, severity: Severity.HIGH, title: "Tare weight drift", description: `Tare differs from the registered baseline by ${Math.abs(current.tareWeightKg - current.vehicle.tareWeightKg)} kg.`, score: 30 });
  }

  const prior = await prisma.weighbridgeTransaction.findFirst({
    where: { vehicleId: current.vehicleId, id: { not: current.id }, capturedAt: { lt: current.capturedAt } },
    orderBy: { capturedAt: "desc" }, include: { site: true },
  });
  if (prior && prior.siteId !== current.siteId) {
    const difference = Math.abs(prior.grossWeightKg - current.grossWeightKg);
    const travelMinutes = (current.capturedAt.getTime() - prior.capturedAt.getTime()) / 60_000;
    if (difference > 500) incidents.push({ type: IncidentType.FRAUD_ALERT, severity: Severity.HIGH, title: "Cross-site weight variance", description: `Weight changed by ${difference} kg between ${prior.site.name} and ${current.site.name}.`, score: Math.min(50, 15 + difference / 100) });
    if (travelMinutes < 20) incidents.push({ type: IncidentType.CLONE_DETECTION, severity: Severity.CRITICAL, title: "Possible cloned plate", description: `The same vehicle appeared at two sites only ${travelMinutes.toFixed(0)} minutes apart.`, score: 60 });
    if (travelMinutes > 24 * 60) incidents.push({ type: IncidentType.ROUTE_DEVIATION, severity: Severity.MEDIUM, title: "Travel-time anomaly", description: `Inter-site travel took ${(travelMinutes / 60).toFixed(1)} hours.`, score: 15 });
  }

  if (!incidents.length) return;
  await prisma.$transaction([
    ...incidents.map((incident) => prisma.incident.create({ data: {
      siteId: current.siteId, transactionId: current.id, vehicleId: current.vehicleId, driverId: current.driverId,
      type: incident.type, severity: incident.severity, title: incident.title, description: incident.description, anomalyScore: incident.score,
    } })),
    prisma.vehicle.update({ where: { id: current.vehicleId }, data: { anomalyScore: { increment: incidents.reduce((sum, item) => sum + item.score, 0) } } }),
    prisma.driver.update({ where: { id: current.driverId }, data: { anomalyScore: { increment: incidents.reduce((sum, item) => sum + item.score * 0.5, 0) } } }),
  ]);
}
