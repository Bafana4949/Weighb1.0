import { UserRole } from "@prisma/client";
import { startOfDay,endOfDay } from "date-fns";
import { ok,requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { transactionStats } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { siteIdentifierWhere } from "@/lib/utils";
export async function GET(request:Request){const a=await requireRole([UserRole.OPERATOR,UserRole.ADMIN,UserRole.TRANSPORTER]);if(a.error)return a.error;const url=new URL(request.url);const date=url.searchParams.get("date")?new Date(url.searchParams.get("date")!):new Date();const site=url.searchParams.get("site");const isTransporter=a.session!.user.role==="TRANSPORTER";const scope=isTransporter?{}:mineScope(a.session!.user.organisationId);const stats=await transactionStats({gte:startOfDay(date),lte:endOfDay(date)},site,scope);const incidents=await prisma.incident.groupBy({by:["severity"],where:{createdAt:{gte:startOfDay(date),lte:endOfDay(date)},site:{...scope,...(site?siteIdentifierWhere(site):{})}},_count:true});return ok({...stats,incidents})}
