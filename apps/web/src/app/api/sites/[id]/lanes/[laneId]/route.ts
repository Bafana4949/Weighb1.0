import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { siteIdentifierWhere } from "@/lib/utils";
import { laneUpdateSchema } from "@/lib/validation";
async function site(id:string){return prisma.site.findFirst({where:siteIdentifierWhere(id)})}
function inScope(row:{organisationId:string},callerOrg:string|null){return !callerOrg||row.organisationId===callerOrg}
async function lane(siteId:string,laneId:string){return prisma.lane.findFirst({where:{id:laneId,siteId}})}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string;laneId:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const {id,laneId}=await params;const row=await site(id);if(!row||!inScope(row,a.session!.user.organisationId))return fail("Site not found",404);const before=await lane(row.id,laneId);if(!before)return fail("Lane not found",404);const parsed=laneUpdateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid lane update",422);try{const updated=await prisma.lane.update({where:{id:before.id},data:parsed.data});await audit({userId:a.session!.user.id,siteId:row.id,action:"LANE_UPDATED",entityType:"lane",entityId:before.id,beforeData:before,afterData:updated});return ok(updated)}catch{return fail("A lane with that number already exists at this site",409)}}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string;laneId:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const {id,laneId}=await params;const row=await site(id);if(!row||!inScope(row,a.session!.user.organisationId))return fail("Site not found",404);const before=await lane(row.id,laneId);if(!before)return fail("Lane not found",404);const updated=await prisma.lane.update({where:{id:before.id},data:{isActive:false}});await audit({userId:a.session!.user.id,siteId:row.id,action:"LANE_DEACTIVATED",entityType:"lane",entityId:before.id,beforeData:{isActive:before.isActive},afterData:{isActive:updated.isActive}});return ok(updated)}
