import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { siteIdentifierWhere } from "@/lib/utils";
import { rateLimitOrFail } from "@/lib/rate-limit";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const limited=rateLimitOrFail(request,"sites-hardware",60,60*1000);if(limited)return limited;const a=await requireRole([UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const site=await prisma.site.findFirst({where:siteIdentifierWhere(id)});if(!site)return fail("Site not found",404);const devices=await prisma.hardwareDevice.findMany({where:{siteId:site.id},include:{statuses:{orderBy:{lastSeen:"desc"},take:1},calibrationCertificates:{orderBy:{expiresAt:"desc"},take:1}}});return ok(devices)}
