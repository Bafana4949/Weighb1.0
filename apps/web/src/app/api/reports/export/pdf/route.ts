import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { dateRange,tonnageByGroup,turnaroundBySite } from "@/lib/reports";
import { rateLimitOrFail } from "@/lib/rate-limit";
import { ReportDocument } from "./report-document";

export const runtime = "nodejs";

export const GET = withScopeErrors(async function GET(request: Request) {
  const limited = rateLimitOrFail(request, "reports-export-pdf", 20, 5 * 60 * 1000);
  if (limited) return limited;
  const access = await requireRole([UserRole.ADMIN, UserRole.OPERATOR]);
  if (access.error) return access.error;

  const url = new URL(request.url);
  const range = dateRange(url.searchParams);
  const group = url.searchParams.get("group") ?? "commodity";
  const scope = userScope(access.session!.user);

  const [{ rows: tonnageRows, rawCount, totalTonnageKg }, { sites: turnaroundRows }, organisation] = await Promise.all([
    tonnageByGroup(range, group, scope),
    turnaroundBySite(range, scope),
    access.session!.user.organisationId ? prisma.organisation.findUnique({ where: { id: access.session!.user.organisationId } }) : Promise.resolve(null),
  ]);

  const averageLoadKg = rawCount ? totalTonnageKg / rawCount : 0;
  const totalTurnaroundTx = turnaroundRows.reduce((s, r) => s + r.transactions, 0);
  const averageTurnaroundSeconds = totalTurnaroundTx > 0
    ? turnaroundRows.reduce((s, r) => s + r.average_seconds * r.transactions, 0) / totalTurnaroundTx
    : 0;

  const document = React.createElement(ReportDocument, {
    organisationName: organisation?.name ?? "All companies",
    from: range.gte.toISOString().slice(0, 10),
    to: range.lte.toISOString().slice(0, 10),
    trucks: rawCount,
    totalTonnageT: (totalTonnageKg / 1000).toFixed(1),
    averageLoadKg: Math.round(averageLoadKg).toLocaleString(),
    averageTurnaroundMin: Math.round(averageTurnaroundSeconds / 60).toString(),
    tonnageRows,
    turnaroundRows,
    generatedAt: new Date().toLocaleString("en-ZA"),
  });
  const buffer = await renderToBuffer(document as unknown as Parameters<typeof renderToBuffer>[0]);
  const isDownload = url.searchParams.get("download") === "true";
  const disposition = isDownload ? "attachment" : "inline";
  return new Response(new Uint8Array(buffer), {
    headers: { "content-type": "application/pdf", "content-disposition": `${disposition}; filename="report-${range.gte.toISOString().slice(0, 10)}-to-${range.lte.toISOString().slice(0, 10)}.pdf"` },
  });
});
