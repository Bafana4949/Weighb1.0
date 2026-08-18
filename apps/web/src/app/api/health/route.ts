import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(){try{await prisma.$queryRaw`SELECT 1`;return ok({status:"ok",timestamp:new Date().toISOString()})}catch(e: any){console.error("DB_HEALTH_ERROR:", e.message); return Response.json({success:false,data:null,error:"database unavailable", dbUrl: process.env.DATABASE_URL},{status:200})}}
