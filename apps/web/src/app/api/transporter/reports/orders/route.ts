import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api";
import { formatSADate } from "@/lib/datetime";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (auth.error) return auth.error;
  
  const orgId = auth.session!.user.organisationId;
  if (!orgId) return new Response("No organisation", { status: 400 });

  const bookings = await prisma.booking.findMany({
    where: { transporterOrganisationId: orgId },
    include: {
      order: {
        include: { source: true, destination: true, originSite: true, destinationSite: true }
      },
      vehicle: true,
      driver: true
    },
    orderBy: { createdAt: "desc" }
  });

  const headers = [
    "Booking Ref", "Order No", "Client", "Commodity", "Target Tonnage", 
    "Window Start", "Window End", "Status", "Truck", "Driver", "Source", "Destination"
  ];
  
  const rows = bookings.map(b => {
    return [
      b.reference,
      b.order?.orderNumber ?? "",
      b.order?.customerName ?? "",
      b.commodity,
      b.targetTonnageKg,
      formatSADate(b.windowStart),
      formatSADate(b.windowEnd),
      b.status,
      b.vehicle.plate,
      `${b.driver.firstName} ${b.driver.lastName}`,
      b.order?.source?.name ?? b.order?.originSite?.name ?? "",
      b.order?.destination?.name ?? b.order?.destinationSite?.name ?? ""
    ].map(csv).join(",");
  });

  const lines = [headers.map(csv).join(","), ...rows];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="assigned-orders-export-${formatSADate(new Date())}.csv"`
    }
  });
}
