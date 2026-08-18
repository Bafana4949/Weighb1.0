import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const auth = await requireRole([UserRole.TRANSPORTER, UserRole.ADMIN]);
  if (auth.error) return auth.error;
  
  const orgId = auth.session!.user.organisationId;
  if (!orgId) return new Response("No organisation", { status: 400 });

  const roster = await prisma.fleetRoster.findMany({
    where: { organisationId: orgId },
    include: {
      vehicle: true,
      trailer1: true,
      trailer2: true,
      driver: true
    },
    orderBy: { rosterDate: "desc" }
  });

  const headers = ["Roster Date", "Truck", "Trailer 1", "Trailer 2", "Driver"];
  const rows = roster.map(r => {
    return [
      r.rosterDate.toISOString().slice(0, 10),
      r.vehicle.plate,
      r.trailer1?.trailerId ?? "",
      r.trailer2?.trailerId ?? "",
      `${r.driver.firstName} ${r.driver.lastName}`
    ].map(csv).join(",");
  });

  const lines = [headers.map(csv).join(","), ...rows];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="roster-export-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
