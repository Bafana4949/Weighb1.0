import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const vehicle=await prisma.vehicle.findUnique({where:{id}});if(!vehicle||(a.session!.user.role==="TRANSPORTER"&&vehicle.organisationId!==a.session!.user.organisationId))return fail("Vehicle not found",404);const data=await prisma.weighbridgeTransaction.findMany({where:{vehicleId:id},include:{site:true,booking:true},orderBy:{capturedAt:"desc"}});return ok(data)}
