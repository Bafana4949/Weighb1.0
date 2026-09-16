import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteIdentifierWhere } from "@/lib/utils";

export function dateRange(searchParams: URLSearchParams): { gte: Date; lte: Date } {
  const toStr = searchParams.get("to");
  let lte: Date;
  if (toStr) {
    lte = new Date(toStr.includes("T") ? toStr : `${toStr}T23:59:59.999Z`);
  } else {
    lte = new Date();
  }

  const fromStr = searchParams.get("from");
  let gte: Date;
  if (fromStr) {
    gte = new Date(fromStr.includes("T") ? fromStr : `${fromStr}T00:00:00.000Z`);
  } else {
    gte = new Date(lte.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { gte, lte };
}

export async function transactionStats(
  range: { gte: Date; lte: Date },
  siteIdentifier?: string | null,
  scope: Prisma.SiteWhereInput = {},
  extraWhere: Prisma.WeighbridgeTransactionWhereInput = {}
) {
  const resolvedSite = siteIdentifier ? await prisma.site.findFirst({ where: siteIdentifierWhere(siteIdentifier), select: { id: true } }) : null;
  const where: Prisma.WeighbridgeTransactionWhereInput = {
    capturedAt: range,
    site: scope,
    ...extraWhere,
    ...(resolvedSite ? { siteId: resolvedSite.id } : {}),
  };
  const [aggregate, turnaround] = await Promise.all([
    prisma.weighbridgeTransaction.aggregate({ where, _sum: { netWeightKg: true }, _count: true, _avg: { netWeightKg: true } }),
    prisma.weighbridgeTransaction.aggregate({ where: { ...where, turnaroundSeconds: { not: null } }, _avg: { turnaroundSeconds: true } }),
  ]);
  return { transaction_count: aggregate._count, total_tonnage_kg: aggregate._sum.netWeightKg ?? 0, average_load_kg: aggregate._avg.netWeightKg ?? 0, average_turnaround_seconds: turnaround._avg.turnaroundSeconds ?? 0 };
}

export function aggregateTransactionRows(rows: Array<{ netWeightKg: number; turnaroundSeconds: number | null }>) {
  const count = rows.length;
  const totalTonnageKg = rows.reduce((sum, row) => sum + row.netWeightKg, 0);
  const turnaround = rows.filter((row) => row.turnaroundSeconds !== null).map((row) => row.turnaroundSeconds as number);
  return { transactionCount: count, totalTonnageKg, averageLoadKg: count ? totalTonnageKg / count : 0, averageTurnaroundSeconds: turnaround.length ? turnaround.reduce((a, b) => a + b, 0) / turnaround.length : 0 };
}

/**
 * Shared by /api/reports/tonnage, admin/reports/page.tsx, and the platform
 * consolidated report — previously each hand-rolled the same Map-based
 * grouping independently, and only the page applied tenant scoping.
 */
export async function tonnageByGroup(range: { gte: Date; lte: Date }, group: string, scope: Prisma.SiteWhereInput = {}, extraWhere: Prisma.WeighbridgeTransactionWhereInput = {}) {
  const rows = await prisma.weighbridgeTransaction.findMany({ where: { capturedAt: range, site: scope, ...extraWhere }, include: { vehicle: true, site: true } });
  const totals = new Map<string, { group: string; net_weight_kg: number; transactions: number }>();
  for (const row of rows) {
    const key = group === "vehicle" ? row.vehicle.plate : group === "site" ? row.site.code : row.commodity;
    const current = totals.get(key) ?? { group: key, net_weight_kg: 0, transactions: 0 };
    current.net_weight_kg += row.netWeightKg; current.transactions++;
    totals.set(key, current);
  }
  return { rows: [...totals.values()].sort((a, b) => b.net_weight_kg - a.net_weight_kg), rawCount: rows.length, totalTonnageKg: rows.reduce((s, r) => s + r.netWeightKg, 0) };
}

export async function turnaroundBySite(range: { gte: Date; lte: Date }, scope: Prisma.SiteWhereInput = {}, extraWhere: Prisma.WeighbridgeTransactionWhereInput = {}) {
  const rows = await prisma.weighbridgeTransaction.findMany({ where: { capturedAt: range, turnaroundSeconds: { not: null }, site: scope, ...extraWhere }, include: { site: true }, orderBy: { turnaroundSeconds: "desc" } });
  const bySite = new Map<string, number[]>();
  for (const row of rows) { const values = bySite.get(row.site.code) ?? []; values.push(row.turnaroundSeconds!); bySite.set(row.site.code, values); }
  return {
    sites: [...bySite].map(([site, values]) => ({ site, average_seconds: Math.round(values.reduce((a, b) => a + b, 0) / values.length), maximum_seconds: Math.max(...values), transactions: values.length })),
    bottlenecks: rows.slice(0, 20).map((row) => ({ transaction_id: row.id, waybill_number: row.waybillNumber, site: row.site.code, turnaround_seconds: row.turnaroundSeconds })),
  };
}

/** Report 3: incidents/exceptions/compliance — grouped by type and severity, plus resolution-time stats. */
export async function incidentsReport(range: { gte: Date; lte: Date }, scope: Prisma.SiteWhereInput = {}) {
  const rows = await prisma.incident.findMany({
    where: { createdAt: range, site: scope },
    include: { site: true, resolvedBy: true },
    orderBy: { createdAt: "desc" },
  });
  const byType = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  let resolvedCount = 0;
  let totalResolutionMs = 0;
  for (const row of rows) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
    bySeverity.set(row.severity, (bySeverity.get(row.severity) ?? 0) + 1);
    if (row.status === "RESOLVED" && row.resolvedAt) { resolvedCount++; totalResolutionMs += row.resolvedAt.getTime() - row.createdAt.getTime(); }
  }
  return {
    total: rows.length,
    unresolved: rows.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED").length,
    by_type: [...byType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    by_severity: [...bySeverity.entries()].map(([severity, count]) => ({ severity, count })),
    average_resolution_minutes: resolvedCount ? Math.round(totalResolutionMs / resolvedCount / 60000) : null,
    rows: rows.map((r) => ({ id: r.id, type: r.type, severity: r.severity, status: r.status, site: r.site.code, description: r.description, created_at: r.createdAt, resolved_at: r.resolvedAt, resolved_by: r.resolvedBy ? `${r.resolvedBy.firstName} ${r.resolvedBy.lastName}` : null })),
  };
}
