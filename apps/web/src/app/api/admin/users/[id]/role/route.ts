import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
const schema=z.object({role:z.nativeEnum(UserRole)});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const access=await requireRole([UserRole.ADMIN]);if(access.error)return access.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid role",422);const {id}=await params;const before=await prisma.user.findUnique({where:{id}});if(!before)return fail("User not found",404);const user=await prisma.user.update({where:{id},data:{role:parsed.data.role}});await audit({userId:access.session!.user.id,action:"USER_ROLE_CHANGED",entityType:"user",entityId:id,beforeData:{role:before.role},afterData:{role:user.role}});const {passwordHash,...safe}=user;return ok(safe)}
