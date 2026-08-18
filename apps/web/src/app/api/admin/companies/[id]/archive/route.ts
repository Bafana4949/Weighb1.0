import { prisma } from "@/lib/prisma";
import { fail,ok,requirePlatformSuperAdmin } from "@/lib/api";
import { audit } from "@/lib/audit";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requirePlatformSuperAdmin();if(a.error)return a.error;const {id}=await params;const before=await prisma.organisation.findFirst({where:{id,type:"MINING_COMPANY"}});if(!before)return fail("Company not found",404);if(before.status==="ARCHIVED")return fail("This company is already archived",409);const updated=await prisma.organisation.update({where:{id},data:{status:"ARCHIVED"}});await audit({userId:a.session!.user.id,action:"COMPANY_ARCHIVED",entityType:"organisation",entityId:id,beforeData:{status:before.status},afterData:{status:"ARCHIVED"}});return ok(updated)}
