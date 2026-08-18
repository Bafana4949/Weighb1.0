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

  const vehicles = await prisma.vehicle.findMany({
    where: { organisationId: orgId, deletedAt: null },
    include: { trailers: true },
    orderBy: { plate: "asc" }
  });

  const headers = ["Type", "Registration", "Make", "Model", "Max Payload (kg)", "Status"];
  const rows = vehicles.map(v => {
    return [
      "Truck",
      v.plate,
      v.make,
      v.model,
      (v.legalMaxGvwKg - v.tareWeightKg).toString(),
      v.status
    ].map(csv).join(",");
  });

  // Also include trailers
  const trailers = await prisma.trailer.findMany({
    where: { vehicle: { organisationId: orgId } }
  });

  trailers.forEach(t => {
    rows.push([
      "Trailer",
      t.trailerId,
      t.type ?? "",
      "",
      "",
      ""
    ].map(csv).join(","));
  });

  // Drivers
  const drivers = await prisma.driver.findMany({
    where: { organisationId: orgId, deletedAt: null }
  });

  drivers.forEach(d => {
    rows.push([
      "Driver",
      `${d.firstName} ${d.lastName}`,
      "",
      "",
      "",
      d.blacklistStatus ? "BLACKLISTED" : "ACTIVE"
    ].map(csv).join(","));
  });

  const lines = [headers.map(csv).join(","), ...rows];

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fleet-export-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
