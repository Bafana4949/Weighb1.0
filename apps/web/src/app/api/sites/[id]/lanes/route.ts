import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { siteIdentifierWhere } from "@/lib/utils";
import { laneSchema } from "@/lib/validation";
async function site(id:string){return prisma.site.findFirst({where:siteIdentifierWhere(id)})}
function inScope(row:{organisationId:string},callerOrg:string|null){return !callerOrg||row.organisationId===callerOrg}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const row=await site(id);if(!row||!inScope(row,a.session!.user.organisationId))return fail("Site not found",404);const lanes=await prisma.lane.findMany({where:{siteId:row.id},orderBy:{laneNumber:"asc"}});return ok(lanes)}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const {id}=await params;const row=await site(id);if(!row||!inScope(row,a.session!.user.organisationId))return fail("Site not found",404);const parsed=laneSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid lane",422);try{const lane=await prisma.lane.create({data:{siteId:row.id,...parsed.data}});await audit({userId:a.session!.user.id,siteId:row.id,action:"LANE_CREATED",entityType:"lane",entityId:lane.id,afterData:lane});return ok(lane,201)}catch{return fail("A lane with that number already exists at this site",409)}}
