import { UserRole } from "@prisma/client";
import { requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { dateRange, incidentsReport } from "@/lib/reports";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { formatSADate, formatSADateTime } from "@/lib/datetime";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export const GET = withScopeErrors(async function GET(request: Request) {
  const limited = rateLimitOrFail(request, "reports-incidents-export-csv", 20, 5 * 60 * 1000);
  if (limited) return limited;
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const report = await incidentsReport(dateRange(url.searchParams), userScope(a.session!.user));
  const header = ["id", "type", "severity", "status", "site", "description", "created_at", "resolved_at", "resolved_by"];
  const lines = [
    header.map(csv).join(","),
    ...report.rows.map((r) => [
      r.id,
      r.type,
      r.severity,
      r.status,
      r.site,
      r.description,
      formatSADateTime(r.created_at),
      r.resolved_at ? formatSADateTime(r.resolved_at) : "",
      r.resolved_by ?? "",
    ].map(csv).join(",")),
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="incidents-report-${formatSADate(new Date())}.csv"`,
    },
  });
});
