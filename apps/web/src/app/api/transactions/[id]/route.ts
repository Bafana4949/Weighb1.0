import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const row=await prisma.weighbridgeTransaction.findUnique({where:{id},include:{booking:true,vehicle:true,trailer:true,driver:true,site:true,operator:true,incidents:true,gateEvents:true}});if(!row||(a.session!.user.role==="TRANSPORTER"&&row.booking.transporterOrganisationId!==a.session!.user.organisationId))return fail("Transaction not found",404);return ok(row)}
