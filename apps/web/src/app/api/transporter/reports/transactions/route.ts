import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api";
import { formatSADate, formatSATime } from "@/lib/datetime";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (auth.error) return auth.error;
  
  const orgId = auth.session!.user.organisationId;
  if (!orgId) return new Response("No organisation", { status: 400 });

  const transactions = await prisma.weighbridgeTransaction.findMany({
    where: { booking: { transporterOrganisationId: orgId } },
    include: {
      site: true,
      vehicle: true,
      driver: true,
      booking: {
        include: { order: { include: { source: true, destination: true, originSite: true, destinationSite: true } } }
      }
    },
    orderBy: { capturedAt: "desc" }
  });

  const headers = [
    "Waybill Number", "Site", "Date", "Time", "Status", "Truck", "Driver", "Commodity", 
    "Gross Weight (kg)", "Tare Weight (kg)", "Net Weight (kg)", "Turnaround (sec)"
  ];
  
  const rows = transactions.map(t => {
    return [
      t.waybillNumber ?? t.edgeTransactionId,
      t.site.name,
      formatSADate(t.capturedAt),
      formatSATime(t.capturedAt),
      t.status,
      t.vehicle?.plate ?? "",
      t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : "",
      t.commodity,
      t.grossWeightKg,
      t.tareWeightKg,
      t.netWeightKg,
      t.turnaroundSeconds
    ].map(csv).join(",");
  });

  const lines = [headers.map(csv).join(","), ...rows];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-export-${formatSADate(new Date())}.csv"`
    }
  });
}
