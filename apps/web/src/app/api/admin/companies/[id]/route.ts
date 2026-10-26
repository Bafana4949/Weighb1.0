import { prisma } from "@/lib/prisma";
import { fail,ok,requirePlatformSuperAdmin } from "@/lib/api";
import { audit } from "@/lib/audit";
import { companyUpdateSchema } from "@/lib/validation";
import { TIER_LABEL, tierRank } from "@/lib/tiers";
async function company(id:string){return prisma.organisation.findFirst({where:{id,type:"MINING_COMPANY"},include:{users:true}})}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requirePlatformSuperAdmin();if(a.error)return a.error;const {id}=await params;const before=await company(id);if(!before)return fail("Company not found",404);const parsed=companyUpdateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid update",422);const {companyName,...rest}=parsed.data;
  // Downgrading a licence must not silently strand sites above it: downgrade those sites first.
  if(rest.licensedTier&&tierRank(rest.licensedTier)<tierRank(before.licensedTier)){
    const above=await prisma.site.findMany({where:{organisationId:id,isActive:true},select:{code:true,operatingTier:true}});
    const blocking=above.filter((x)=>tierRank(x.operatingTier)>tierRank(rest.licensedTier!));
    if(blocking.length)return fail(`Downgrade these sites first: ${blocking.map((x)=>`${x.code} (${TIER_LABEL[x.operatingTier]})`).join(", ")}`,409);
  }
  const updated=await prisma.organisation.update({where:{id},data:{...rest,...(companyName?{name:companyName}:{})}});
  await audit({userId:a.session!.user.id,actorRole:"PLATFORM_SUPER_ADMIN",organisationId:id,action:rest.licensedTier&&rest.licensedTier!==before.licensedTier?"COMPANY_LICENCE_CHANGED":"COMPANY_UPDATED",entityType:"organisation",entityId:id,beforeData:{name:before.name,licensedTier:before.licensedTier},afterData:{name:updated.name,licensedTier:updated.licensedTier}});return ok(updated)}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requirePlatformSuperAdmin();if(a.error)return a.error;const {id}=await params;const before=await company(id);if(!before)return fail("Company not found",404);await prisma.$transaction([prisma.organisation.update({where:{id},data:{isActive:false,status:"SUSPENDED",deletedAt:new Date()}}),prisma.user.updateMany({where:{organisationId:id},data:{status:"SUSPENDED",deletedAt:new Date()}})]);await audit({userId:a.session!.user.id,action:"COMPANY_DELETED",entityType:"organisation",entityId:id,beforeData:{isActive:before.isActive},afterData:{isActive:false,deleted:true}});return ok({id,isActive:false,deleted:true})}
