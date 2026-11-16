import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// Unauthenticated liveness probe for load balancers and Docker. Deliberately says
// nothing about configuration or the database host; details go to the server log.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "ok", timestamp: new Date().toISOString() });
  } catch (e: unknown) {
    logger.error("health_database_unavailable", { message: e instanceof Error ? e.message : String(e) });
    return Response.json({ success: false, data: null, error: "database unavailable" }, { status: 503 });
  }
}
