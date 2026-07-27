import { UserRole } from "@prisma/client";
import { ok,requireRole } from "@/lib/api";
import { dateRange,transactionStats } from "@/lib/reports";
export async function GET(request:Request){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const url=new URL(request.url);return ok(await transactionStats(dateRange(url.searchParams),url.searchParams.get("site")))}
