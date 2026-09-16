import { UserRole } from "@prisma/client";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { dateRange, turnaroundBySite } from "@/lib/reports";

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.OPERATOR, UserRole.ADMIN]);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const report = await turnaroundBySite(dateRange(url.searchParams), userScope(a.session!.user));
  return ok(report);
});
