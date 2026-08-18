import { UserRole } from "@prisma/client";
import { ok,requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { dateRange,turnaroundBySite } from "@/lib/reports";
export async function GET(request:Request){const a=await requireRole([UserRole.OPERATOR,UserRole.ADMIN]);if(a.error)return a.error;const url=new URL(request.url);const report=await turnaroundBySite(dateRange(url.searchParams),mineScope(a.session!.user.organisationId));return ok(report)}
