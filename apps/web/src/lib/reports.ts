import { prisma } from "@/lib/prisma";
import { siteIdentifierWhere } from "@/lib/utils";

export function dateRange(searchParams: URLSearchParams): { gte: Date; lte: Date } {
  const lte = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
  const gte = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date(lte.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { gte, lte };
}

export async function transactionStats(range: { gte: Date; lte: Date }, siteIdentifier?: string | null) {
  const resolvedSite = siteIdentifier ? await prisma.site.findFirst({ where: siteIdentifierWhere(siteIdentifier), select: { id: true } }) : null;
  const where = { capturedAt: range, ...(resolvedSite ? { siteId: resolvedSite.id } : {}) };
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
