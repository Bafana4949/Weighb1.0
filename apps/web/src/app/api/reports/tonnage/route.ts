import { UserRole } from "@prisma/client";
import { ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { dateRange, tonnageByGroup } from "@/lib/reports";

export const GET = withScopeErrors(async function GET(request: Request) {
  const a = await requireRole([UserRole.TRANSPORTER, UserRole.OPERATOR, UserRole.ADMIN]);
  if (a.error) return a.error;

  const url = new URL(request.url);
  const range = dateRange(url.searchParams);
  const group = url.searchParams.get("group") ?? "commodity";
  const isTransporter = a.session!.user.role === "TRANSPORTER";

  const { rows } = await tonnageByGroup(
    range,
    group,
    isTransporter ? {} : userScope(a.session!.user),
    isTransporter ? { booking: { transporterOrganisationId: a.session!.user.organisationId! } } : {}
  );

  return ok(rows);
});
