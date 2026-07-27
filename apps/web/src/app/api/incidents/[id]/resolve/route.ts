import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
const schema=z.object({notes:z.string().min(10).max(2000),dismissed:z.boolean().optional()});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Resolution notes are required",422);const {id}=await params;const before=await prisma.incident.findUnique({where:{id},include:{site:true}});if(!before)return fail("Incident not found",404);const callerOrg=a.session!.user.organisationId;if(callerOrg&&before.site.organisationId!==callerOrg)return fail("Incident not found",404);const row=await prisma.incident.update({where:{id},data:{status:parsed.data.dismissed?"DISMISSED":"RESOLVED",resolvedById:a.session!.user.id,resolutionNotes:parsed.data.notes,resolvedAt:new Date()}});await audit({userId:a.session!.user.id,siteId:row.siteId,action:"INCIDENT_RESOLVED",entityType:"incident",entityId:id,beforeData:{status:before.status},afterData:{status:row.status,notes:row.resolutionNotes}});return ok(row)}
