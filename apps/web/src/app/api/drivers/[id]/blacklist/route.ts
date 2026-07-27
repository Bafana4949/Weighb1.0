import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
const schema=z.object({blacklisted:z.boolean(),reason:z.string().min(10).max(500).nullable()});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("A detailed blacklist reason is required",422);const {id}=await params;const before=await prisma.driver.findUnique({where:{id}});if(!before)return fail("Driver not found",404);const driver=await prisma.driver.update({where:{id},data:{blacklistStatus:parsed.data.blacklisted,blacklistReason:parsed.data.blacklisted?parsed.data.reason:null}});await audit({userId:a.session!.user.id,action:parsed.data.blacklisted?"DRIVER_BLACKLISTED":"DRIVER_REMOVED_FROM_BLACKLIST",entityType:"driver",entityId:id,beforeData:{blacklistStatus:before.blacklistStatus},afterData:{blacklistStatus:driver.blacklistStatus,reason:driver.blacklistReason}});const {idNumberEncrypted,idNumberHash,...safe}=driver;return ok(safe)}
