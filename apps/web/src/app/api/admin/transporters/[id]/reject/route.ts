import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
const schema=z.object({reason:z.string().min(10).max(500)});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;if(a.session!.user.organisationId)return fail("Only the platform administrator can reject transporters",403);const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("A rejection reason of at least 10 characters is required",422);const {id}=await params;const before=await prisma.organisation.findFirst({where:{id,type:"HAULIER",deletedAt:null}});if(!before)return fail("Application not found",404);if(before.isActive)return fail("This transporter is already active and cannot be rejected",409);await prisma.$transaction([prisma.organisation.update({where:{id},data:{deletedAt:new Date()}}),prisma.user.updateMany({where:{organisationId:id},data:{status:"SUSPENDED"}})]);await audit({userId:a.session!.user.id,action:"TRANSPORTER_APPLICATION_REJECTED",entityType:"organisation",entityId:id,beforeData:{name:before.name},afterData:{reason:parsed.data.reason}});return ok({id,rejected:true})}
