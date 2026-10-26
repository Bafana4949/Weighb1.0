import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { safeDriverSelect, safeUserSelect } from "@/lib/utils";
import { canViewTransaction } from "@/lib/site-access";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const row=await prisma.weighbridgeTransaction.findUnique({where:{id},include:{booking:true,vehicle:true,trailer:true,driver:{select:safeDriverSelect},site:true,operator:{select:safeUserSelect},incidents:true,gateEvents:true}});if(!row||!(await canViewTransaction(a.session!.user,row)))return fail("Transaction not found",404);return ok(row)}
