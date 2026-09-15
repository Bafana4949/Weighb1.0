import { prisma } from "@/lib/prisma";
import { requirePlatformSuperAdmin } from "@/lib/api";

export async function GET() {
  const adminCheck = await requirePlatformSuperAdmin();
  if (adminCheck.error) return adminCheck.error;
  const sites = await prisma.site.findMany({ select: { id: true, name: true, code: true } });
  const orders = await prisma.weighbridgeOrder.findMany({ select: { id: true, orderNumber: true, siteId: true }, take: 2, orderBy: { createdAt: 'desc' } });
  const bookings = await prisma.booking.findMany({ select: { id: true, status: true, siteId: true, windowStart: true, windowEnd: true }, take: 5, orderBy: { createdAt: 'desc' } });

  return new Response(JSON.stringify({ sites, orders, bookings }, null, 2), { headers: { "content-type": "application/json" } });
}
