import { UserRole } from "@prisma/client";
import { ok, requireRole } from "@/lib/api";
import { dateRange, transactionStats } from "@/lib/reports";
import { mineScope } from "@/lib/access";

export async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const isTransporter = a.session!.user.role === UserRole.TRANSPORTER;
  const scope = isTransporter ? {} : mineScope(a.session!.user.organisationId);
  return ok(await transactionStats(dateRange(url.searchParams), url.searchParams.get("site"), scope));
}
