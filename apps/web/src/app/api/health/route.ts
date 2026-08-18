import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(){
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "ok", timestamp: new Date().toISOString() });
  } catch (e: any) {
    return Response.json({
      success: false,
      data: null,
      error: "database unavailable",
      details: e?.message || String(e),
      code: e?.code || null,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split("@")[1] : null,
    }, { status: 200 });
  }
}

