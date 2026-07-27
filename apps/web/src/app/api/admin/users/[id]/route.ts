import { UserRole,UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";

const updateSchema=z.object({
  firstName:z.string().min(2).optional(),
  lastName:z.string().min(2).optional(),
  phone:z.string().max(30).optional().nullable(),
  role:z.nativeEnum(UserRole).optional(),
  status:z.nativeEnum(UserStatus).optional(),
  organisationId:z.string().uuid().optional().nullable(),
});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const access=await requireRole([UserRole.ADMIN]);if(access.error)return access.error;
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid update",422);
  const {id}=await params;
  const before=await prisma.user.findUnique({where:{id}});
  if(!before)return fail("User not found",404);
  const callerOrg=access.session!.user.organisationId;
  if(callerOrg&&before.organisationId!==callerOrg)return fail("User not found",404);
  if(callerOrg&&"organisationId" in parsed.data&&parsed.data.organisationId!==callerOrg){
    return fail("You cannot move a user to a different company",422);
  }
  if(id===access.session!.user.id&&parsed.data.role&&parsed.data.role!==UserRole.ADMIN){
    return fail("You cannot remove your own administrator role",422);
  }
  if(parsed.data.organisationId){
    const org=await prisma.organisation.findUnique({where:{id:parsed.data.organisationId}});
    if(!org||org.deletedAt)return fail("Organisation not found",422);
  }
  const {status,...rest}=parsed.data;
  const user=await prisma.user.update({where:{id},data:{
    ...rest,
    ...(status?{status,...(status===UserStatus.ACTIVE?{deletedAt:null}:{})}:{}),
  }});
  await audit({userId:access.session!.user.id,action:"USER_UPDATED",entityType:"user",entityId:id,beforeData:{role:before.role,status:before.status,organisationId:before.organisationId},afterData:{role:user.role,status:user.status,organisationId:user.organisationId}});
  const {passwordHash,...safe}=user;
  return ok(safe);
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const access=await requireRole([UserRole.ADMIN]);if(access.error)return access.error;
  const {id}=await params;
  if(id===access.session!.user.id)return fail("You cannot deactivate your own account",422);
  const before=await prisma.user.findUnique({where:{id}});
  if(!before)return fail("User not found",404);
  const callerOrg=access.session!.user.organisationId;
  if(callerOrg&&before.organisationId!==callerOrg)return fail("User not found",404);
  const user=await prisma.user.update({where:{id},data:{status:UserStatus.SUSPENDED,deletedAt:new Date()}});
  await audit({userId:access.session!.user.id,action:"USER_DEACTIVATED",entityType:"user",entityId:id,beforeData:{status:before.status},afterData:{status:user.status}});
  const {passwordHash,...safe}=user;
  return ok(safe);
}
