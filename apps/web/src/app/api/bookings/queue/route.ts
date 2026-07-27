import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { activeWindowWhere } from "@/lib/booking-service";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireSiteOrRole } from "@/lib/api";
import { siteIdentifierWhere } from "@/lib/utils";
export async function GET(request:NextRequest){const a=await requireSiteOrRole(request,[UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const site=request.nextUrl.searchParams.get("site");if(!site)return fail("site is required",422);const resolvedSite=await prisma.site.findFirst({where:siteIdentifierWhere(site)});if(!resolvedSite)return fail("Site not found",404);const queue=await prisma.booking.findMany({where:{siteId:resolvedSite.id,...activeWindowWhere()},include:{vehicle:true,driver:true},orderBy:{windowStart:"asc"},take:20});return ok(queue.map((item)=>({id:item.id,reference:item.reference,plate:item.vehicle.plate,driver:`${item.driver.firstName} ${item.driver.lastName}`,commodity:item.commodity,status:item.status})))}
