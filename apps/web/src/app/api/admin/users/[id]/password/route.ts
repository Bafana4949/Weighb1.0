import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireCompanyAdmin } from "@/lib/api";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
const schema=z.object({password:z.string().min(8)});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireCompanyAdmin();if(a.error)return a.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Password must be at least 8 characters",422);const {id}=await params;const before=await prisma.user.findUnique({where:{id}});if(!before)return fail("User not found",404);const callerOrg=a.session!.user.organisationId;const isSuper=isPlatformSuperAdmin(a.session!.user);if(!isSuper&&(before.organisationId!==callerOrg||before.platformRole))return fail("User not found",404);if(!isSuper&&before.role===UserRole.ADMIN&&before.id!==a.session!.user.id)return fail("Only the platform administrator can reset another Administrator's password",403);await prisma.$transaction([prisma.user.update({where:{id},data:{passwordHash:await bcrypt.hash(parsed.data.password,12)}}),prisma.passwordResetToken.updateMany({where:{userId:id,usedAt:null},data:{usedAt:new Date()}})]);await audit({userId:a.session!.user.id,action:"USER_PASSWORD_RESET_BY_ADMIN",entityType:"user",entityId:id});return ok({id,reset:true})}
