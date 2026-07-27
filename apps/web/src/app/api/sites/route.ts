import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { mineScope } from "@/lib/access";
import { siteSchema } from "@/lib/validation";
export async function GET(){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const scope=a.session!.user.role==="TRANSPORTER"?{}:mineScope(a.session!.user.organisationId);return ok(await prisma.site.findMany({where:{isActive:true,...scope},include:{organisation:true,config:true},orderBy:{code:"asc"}}))}
export async function POST(request:Request){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const parsed=siteSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid site",422);const callerOrg=a.session!.user.organisationId;const {operatingStart,operatingEnd,...siteData}=parsed.data;try{const site=await prisma.site.create({data:{...siteData,organisationId:callerOrg??siteData.organisationId,code:siteData.code.toUpperCase(),config:{create:{...(operatingStart?{operatingStart}:{}),...(operatingEnd?{operatingEnd}:{})}}},include:{organisation:true,config:true}});await audit({userId:a.session!.user.id,siteId:site.id,action:"SITE_CREATED",entityType:"site",entityId:site.id,afterData:site});return ok(site,201)}catch(error){return fail("Site code is already registered",409)}}
