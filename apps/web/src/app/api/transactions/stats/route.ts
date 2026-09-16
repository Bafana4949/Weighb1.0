import { UserRole } from "@prisma/client";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { dateRange, transactionStats } from "@/lib/reports";
import { userScope, transporterScope } from "@/lib/access";
import { isPlatformSuperAdmin } from "@/lib/permissions";

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SECURITY]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const isSuper = isPlatformSuperAdmin(a.session!.user);
  const isTransporter = a.session!.user.role === UserRole.TRANSPORTER;

  const scope = isSuper || isTransporter ? {} : userScope(a.session!.user);
  const extraWhere = isTransporter ? transporterScope(a.session!.user) : {};

  return ok(await transactionStats(dateRange(url.searchParams), url.searchParams.get("site"), scope, extraWhere));
});
