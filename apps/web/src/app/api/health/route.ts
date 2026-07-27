import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export async function GET(){try{await prisma.$queryRaw`SELECT 1`;return ok({status:"ok",timestamp:new Date().toISOString()})}catch{return Response.json({success:false,data:null,error:"database unavailable"},{status:503})}}
