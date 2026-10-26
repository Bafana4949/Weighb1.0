import { UserRole,UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireCompanyAdmin } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const updateSchema=z.object({
  firstName:z.string().min(2).optional(),
  lastName:z.string().min(2).optional(),
  phone:z.string().max(30).optional().nullable(),
  role:z.nativeEnum(UserRole).optional(),
  status:z.nativeEnum(UserStatus).optional(),
  organisationId:z.string().uuid().optional().nullable(),
  roleIds:z.array(z.string().uuid()).optional(),
});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const access=await requireCompanyAdmin();if(access.error)return access.error;
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid update",422);
  const {id}=await params;
  const before=await prisma.user.findUnique({where:{id}});
  if(!before)return fail("User not found",404);
  const callerOrg=access.session!.user.organisationId;
  const isSuper=isPlatformSuperAdmin(access.session!.user);
  if(!isSuper&&(before.organisationId!==callerOrg||before.platformRole))return fail("User not found",404);
  // Matches /admin/users/[id]/role: only the platform super admin grants or changes Administrator.
  if(!isSuper&&parsed.data.role&&parsed.data.role!==before.role&&(parsed.data.role===UserRole.ADMIN||before.role===UserRole.ADMIN)){
    return fail("Only the platform administrator can grant or change Administrator privileges",403);
  }
  if("organisationId" in parsed.data&&!parsed.data.organisationId&&before.platformRole!=="PLATFORM_SUPER_ADMIN"){
    return fail("A user must belong to a company",422);
  }
  if(parsed.data.roleIds?.length){
    const orgForRoles=parsed.data.organisationId??before.organisationId;
    const valid=await prisma.role.count({where:{id:{in:parsed.data.roleIds},OR:[{organisationId:null},{organisationId:orgForRoles}]}});
    if(valid!==new Set(parsed.data.roleIds).size)return fail("Roles must be built-in roles or roles of this company",422);
  }
  if(!isSuper&&"organisationId" in parsed.data&&parsed.data.organisationId!==callerOrg){
    return fail("You cannot move a user to a different company",422);
  }
  if(id===access.session!.user.id&&parsed.data.role&&parsed.data.role!==UserRole.ADMIN){
    return fail("You cannot remove your own administrator role",422);
  }
  if(parsed.data.organisationId){
    const org=await prisma.organisation.findUnique({where:{id:parsed.data.organisationId}});
    if(!org||org.deletedAt)return fail("Organisation not found",422);
  }
  const {status,roleIds,...rest}=parsed.data;
  const user=await prisma.user.update({where:{id},data:{
    ...rest,
    ...(status?{status,...(status===UserStatus.ACTIVE?{deletedAt:null}:{})}:{}),
  }});
  
  if (roleIds) {
    await prisma.userRoleAssignment.deleteMany({ where: { userId: id } });
    if (roleIds.length > 0) {
      await prisma.userRoleAssignment.createMany({
        data: roleIds.map(roleId => ({ userId: id, roleId }))
      });
    }
  }
  
  await audit({userId:access.session!.user.id,action:"USER_UPDATED",entityType:"user",entityId:id,beforeData:{role:before.role,status:before.status,organisationId:before.organisationId},afterData:{role:user.role,status:user.status,organisationId:user.organisationId,roleIds}});
  const {passwordHash,...safe}=user;
  return ok({ ...safe, roleAssignments: roleIds?.map(roleId => ({ roleId })) || [] });
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const access=await requireCompanyAdmin();if(access.error)return access.error;
  const {id}=await params;
  if(id===access.session!.user.id)return fail("You cannot deactivate your own account",422);
  const before=await prisma.user.findUnique({where:{id}});
  if(!before)return fail("User not found",404);
  const callerOrg=access.session!.user.organisationId;
  const isSuper=isPlatformSuperAdmin(access.session!.user);
  if(!isSuper&&(before.organisationId!==callerOrg||before.platformRole))return fail("User not found",404);
  if(!isSuper&&before.role===UserRole.ADMIN)return fail("Only the platform administrator can deactivate Administrator accounts",403);
  const user=await prisma.user.update({where:{id},data:{status:UserStatus.SUSPENDED,deletedAt:new Date()}});
  await audit({userId:access.session!.user.id,action:"USER_DEACTIVATED",entityType:"user",entityId:id,beforeData:{status:before.status},afterData:{status:user.status}});
  const {passwordHash,...safe}=user;
  return ok(safe);
}
